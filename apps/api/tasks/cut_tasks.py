"""
ViraEdit — Video cut Celery tasks (Module 04).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import structlog
from celery import Task
from sqlalchemy import create_engine, text

from celery_app import celery_app
from config import settings
from processors.storage_helpers import storage_sync
from processors.text_editor import apply_cuts

log = structlog.get_logger("viraedit.tasks.cut")


def _sync_db_url() -> str:
    return settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")


def _update_job_sync(
    job_id: str,
    *,
    status: str | None = None,
    result: dict | None = None,
    error: str | None = None,
) -> None:
    engine = create_engine(_sync_db_url(), pool_pre_ping=True)
    sets: list[str] = []
    params: dict[str, Any] = {"id": job_id}

    if status is not None:
        sets.append("status = :status")
        params["status"] = status
    if result is not None:
        sets.append("result = CAST(:result AS jsonb)")
        params["result"] = json.dumps(result)
    if error is not None:
        sets.append("error = :error")
        params["error"] = error

    if not sets:
        return

    sql = f"UPDATE jobs SET {', '.join(sets)}, updated_at = NOW() WHERE id = :id"
    with engine.begin() as conn:
        conn.execute(text(sql), params)


@celery_app.task(bind=True, name="tasks.cut.apply")
def apply_cuts_task(
    self: Task,
    job_id: str,
    video_key: str,
    cuts: list[dict[str, Any]],
    project_id: str,
) -> dict[str, Any]:
    """Download source video, apply cut list, upload edited render."""
    _update_job_sync(job_id, status="processing")
    local_path: Path | None = None
    out_path: Path | None = None

    try:
        local_path = storage_sync.download_to_temp(video_key, job_id)
        out_path = local_path.with_name(f"{local_path.stem}_edited.mp4")
        apply_cuts(local_path, out_path, cuts)
        out_key = f"projects/{project_id}/edited/{job_id}.mp4"
        storage_sync.put_file(out_key, out_path, content_type="video/mp4")
        signed_url = storage_sync.get_presigned_url(out_key)
        payload = {"output_key": out_key, "url": signed_url, "cut_count": len(cuts)}
        _update_job_sync(job_id, status="done", result=payload)
        log.info("apply_cuts_done", job_id=job_id, cut_count=len(cuts))
        return payload

    except Exception as exc:
        _update_job_sync(job_id, status="failed", error=str(exc))
        log.error("apply_cuts_failed", job_id=job_id, error=str(exc))
        raise
    finally:
        for p in (local_path, out_path):
            if p and p.exists():
                try:
                    p.unlink()
                except OSError:
                    pass
