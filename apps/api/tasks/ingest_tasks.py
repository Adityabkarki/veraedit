"""
ViraEdit — Celery tasks for video ingestion (URL + uploaded file).
"""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any, Optional

import structlog
from celery import Task
from sqlalchemy import create_engine, text

from celery_app import celery_app
from config import settings
from processors.downloader import download_video, extract_metadata, generate_thumbnail
from processors.storage_helpers import storage_sync

log = structlog.get_logger("viraedit.tasks.ingest")


def _sync_db_url() -> str:
    return settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")


def _update_job_sync(
    job_id: str,
    *,
    status: Optional[str] = None,
    result: Optional[dict] = None,
    error: Optional[str] = None,
) -> None:
    engine = create_engine(_sync_db_url(), pool_pre_ping=True)
    sets: list[str] = []
    params: dict[str, Any] = {"id": job_id}

    if status is not None:
        sets.append("status = :status")
        params["status"] = status
    if result is not None:
        sets.append("result = CAST(:result AS jsonb)")
        import json

        params["result"] = json.dumps(result)
    if error is not None:
        sets.append("error = :error")
        params["error"] = error

    if not sets:
        return

    sql = f"UPDATE jobs SET {', '.join(sets)}, updated_at = NOW() WHERE id = :id"
    with engine.begin() as conn:
        conn.execute(text(sql), params)


def _queue_transcription(asset_id: str) -> None:
    try:
        celery_app.send_task(
            "tasks.transcribe.run",
            kwargs={"asset_id": asset_id},
            queue="transcription",
        )
        log.info("ingest_transcription_queued", asset_id=asset_id)
    except Exception as exc:
        log.warning(
            "ingest_transcription_queue_failed",
            asset_id=asset_id,
            error=str(exc),
        )


def _finish_ingest(
    job_id: str,
    local_path: Path,
    project_id: str,
    *,
    source_url: Optional[str] = None,
    original_filename: Optional[str] = None,
) -> dict[str, Any]:
    meta = extract_metadata(local_path)
    thumb_path = generate_thumbnail(local_path, job_id)

    asset_id = str(uuid.uuid4())
    video_key = f"projects/{project_id}/raw/{job_id}.mp4"
    thumb_key = f"projects/{project_id}/thumbnails/{job_id}.jpg"

    storage_sync.put_file(video_key, local_path, "video/mp4")
    storage_sync.put_file(thumb_key, thumb_path, "image/jpeg")

    filename = original_filename or local_path.name
    media_metadata = {
        **meta,
        "thumb_key": thumb_key,
        "source_url": source_url,
    }

    engine = create_engine(_sync_db_url(), pool_pre_ping=True)
    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO assets (
                    id, project_id, name, original_filename, storage_key,
                    file_size, duration_seconds, media_type, mime_type,
                    status, media_metadata, created_at, updated_at
                ) VALUES (
                    :id, :project_id, :name, :original_filename, :storage_key,
                    :file_size, :duration_seconds, 'VIDEO', 'video/mp4',
                    'UPLOADED', CAST(:media_metadata AS jsonb), NOW(), NOW()
                )
            """),
            {
                "id": asset_id,
                "project_id": project_id,
                "name": filename,
                "original_filename": filename,
                "storage_key": video_key,
                "file_size": meta.get("file_size") or local_path.stat().st_size,
                "duration_seconds": meta.get("duration"),
                "media_metadata": __import__("json").dumps(media_metadata),
            },
        )

    result = {
        "asset_id": asset_id,
        "video_key": video_key,
        "thumb_key": thumb_key,
        "meta": meta,
    }
    _update_job_sync(job_id, status="done", result=result)
    _queue_transcription(asset_id)

    for path in (local_path, thumb_path):
        try:
            if path.exists():
                path.unlink()
        except OSError as exc:
            log.warning("ingest_temp_cleanup_failed", path=str(path), error=str(exc))

    log.info("ingest_finished", job_id=job_id, asset_id=asset_id)
    return result


@celery_app.task(
    bind=True, max_retries=2, soft_time_limit=1800, time_limit=2100, name="tasks.ingest.ingest_url"
)
def ingest_url_task(self: Task, job_id: str, url: str, project_id: str) -> dict[str, Any]:
    _update_job_sync(job_id, status="processing")
    try:
        local_path = download_video(url, job_id)
        return _finish_ingest(job_id, local_path, project_id, source_url=url)
    except Exception as exc:
        _update_job_sync(job_id, status="failed", error=str(exc))
        log.error("ingest_url_failed", job_id=job_id, error=str(exc))
        raise self.retry(exc=exc, countdown=10)


@celery_app.task(bind=True, name="tasks.ingest.process_upload")
def process_uploaded_file_task(
    self: Task,
    job_id: str,
    raw_key: str,
    project_id: str,
    original_filename: str = "upload.mp4",
) -> dict[str, Any]:
    _update_job_sync(job_id, status="processing")
    try:
        local_path = storage_sync.download_to_temp(raw_key, job_id)
        return _finish_ingest(
            job_id,
            local_path,
            project_id,
            original_filename=original_filename,
        )
    except Exception as exc:
        _update_job_sync(job_id, status="failed", error=str(exc))
        log.error("ingest_upload_failed", job_id=job_id, error=str(exc))
        raise
