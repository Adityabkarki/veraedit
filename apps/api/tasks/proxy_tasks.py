"""
ViraEdit — Celery task: generate edit proxy after upload.
"""
from __future__ import annotations

import uuid
from pathlib import Path

import structlog
from celery import Task
from sqlalchemy import create_engine, text

from celery_app import celery_app
from config import settings
from models.asset import ProxyStatus
from processors.storage_helpers import storage_sync
from processors.video_proxy import create_edit_proxy, proxy_storage_key_for

log = structlog.get_logger("viraedit.tasks.proxy")


def _sync_db_url() -> str:
    return settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")


def _update_proxy_sync(
    asset_id: str,
    *,
    proxy_status: str | None = None,
    proxy_storage_key: str | None = None,
    proxy_file_size: int | None = None,
    media_metadata_patch: dict | None = None,
) -> None:
    engine = create_engine(_sync_db_url(), pool_pre_ping=True)
    sets: list[str] = []
    params: dict = {"id": asset_id}

    if proxy_status is not None:
        sets.append("proxy_status = :proxy_status")
        params["proxy_status"] = proxy_status
    if proxy_storage_key is not None:
        sets.append("proxy_storage_key = :proxy_storage_key")
        params["proxy_storage_key"] = proxy_storage_key
    if proxy_file_size is not None:
        sets.append("proxy_file_size = :proxy_file_size")
        params["proxy_file_size"] = proxy_file_size
    if media_metadata_patch is not None:
        import json

        sets.append(
            "media_metadata = COALESCE(media_metadata, '{}'::jsonb) || CAST(:meta AS jsonb)"
        )
        params["meta"] = json.dumps(media_metadata_patch)

    if not sets:
        return

    sql = f"UPDATE assets SET {', '.join(sets)}, updated_at = NOW() WHERE id = :id"
    with engine.begin() as conn:
        conn.execute(text(sql), params)


def queue_edit_proxy(asset_id: str) -> None:
    celery_app.send_task(
        "tasks.proxy.generate",
        kwargs={"asset_id": asset_id},
        queue="render",
    )


@celery_app.task(
    bind=True,
    name="tasks.proxy.generate",
    soft_time_limit=7200,
    time_limit=7500,
)
def generate_edit_proxy_task(self: Task, asset_id: str) -> dict:
    """
    Download original from MinIO, transcode to 540p H.264 proxy, upload proxy.
    Original storage_key is never modified.
    """
    engine = create_engine(_sync_db_url(), pool_pre_ping=True)
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT id, project_id, storage_key, media_type, proxy_status
                FROM assets WHERE id = :id
                """
            ),
            {"id": asset_id},
        ).mappings().first()

    if not row:
        log.warning("edit_proxy_asset_missing", asset_id=asset_id)
        return {"status": "skipped", "reason": "asset_not_found"}

    if str(row["media_type"]).upper() != "VIDEO":
        _update_proxy_sync(asset_id, proxy_status=ProxyStatus.SKIPPED.value)
        return {"status": "skipped", "reason": "not_video"}

    if row["proxy_status"] == ProxyStatus.READY.value:
        return {"status": "already_ready"}

    project_id = str(row["project_id"])
    source_key = row["storage_key"]
    proxy_key = proxy_storage_key_for(project_id, asset_id)

    _update_proxy_sync(asset_id, proxy_status=ProxyStatus.PROCESSING.value)

    local_source: Path | None = None
    local_proxy: Path | None = None

    try:
        local_source = storage_sync.download_to_temp(source_key, asset_id)
        work_dir = local_source.parent / "proxy_work"
        work_dir.mkdir(parents=True, exist_ok=True)
        local_proxy = work_dir / "edit_proxy.mp4"

        meta = create_edit_proxy(local_source, local_proxy)
        storage_sync.put_file(proxy_key, local_proxy, "video/mp4")

        _update_proxy_sync(
            asset_id,
            proxy_status=ProxyStatus.READY.value,
            proxy_storage_key=proxy_key,
            proxy_file_size=int(meta.get("file_size") or local_proxy.stat().st_size),
            media_metadata_patch={"edit_proxy": meta},
        )

        log.info(
            "edit_proxy_uploaded",
            asset_id=asset_id,
            proxy_key=proxy_key,
            size_mb=round((meta.get("file_size") or 0) / (1024 * 1024), 2),
        )
        return {"status": "ready", "proxy_storage_key": proxy_key, "meta": meta}

    except Exception as exc:
        _update_proxy_sync(asset_id, proxy_status=ProxyStatus.FAILED.value)
        log.error("edit_proxy_failed", asset_id=asset_id, error=str(exc))
        raise

    finally:
        for path in (local_source, local_proxy):
            if path and path.exists():
                try:
                    path.unlink()
                except OSError:
                    pass
