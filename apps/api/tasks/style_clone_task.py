"""
ViraEdit — Style clone Celery task (Module 02).
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path

import structlog
from celery import Task
from sqlalchemy import create_engine, text

from celery_app import celery_app
from config import settings
from processors.storage_helpers import storage_sync
from processors.style_analyzer import analyze_video_style

log = structlog.get_logger("viraedit.tasks.style_clone")


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
    params: dict = {"id": job_id}

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


@celery_app.task(bind=True, name="tasks.style_clone.run")
def style_clone_task(
    self: Task,
    job_id: str,
    video_key: str,
    project_id: str,
    template_name: str,
) -> dict:
    _update_job_sync(job_id, status="processing")
    local_path: Path | None = None

    try:
        local_path = storage_sync.download_to_temp(video_key, job_id)
        import asyncio

        template_data = asyncio.run(analyze_video_style(local_path, project_id))
        template_id = str(uuid.uuid4())

        engine = create_engine(_sync_db_url(), pool_pre_ping=True)
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO templates (
                        id, name, project_id, source_job_id, data, is_public,
                        created_at, updated_at
                    ) VALUES (
                        :id, :name, :project_id, :source_job_id,
                        CAST(:data AS jsonb), false, NOW(), NOW()
                    )
                """),
                {
                    "id": template_id,
                    "name": template_name,
                    "project_id": project_id,
                    "source_job_id": job_id,
                    "data": json.dumps(template_data),
                },
            )

        result = {
            "template_id": template_id,
            "template": template_data,
            "name": template_name,
        }
        _update_job_sync(job_id, status="done", result=result)
        log.info("style_clone_done", job_id=job_id, template_id=template_id)
        return result

    except Exception as exc:
        _update_job_sync(job_id, status="failed", error=str(exc))
        log.error("style_clone_failed", job_id=job_id, error=str(exc))
        raise
    finally:
        if local_path and local_path.exists():
            try:
                local_path.unlink()
            except OSError:
                pass
