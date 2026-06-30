"""
ViraEdit — Style intelligence Celery tasks (Phase 01).
"""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from pathlib import Path

import structlog
from celery import Task
from sqlalchemy import create_engine, text

from celery_app import celery_app
from config import settings
from processors.gemini_style_analyzer import analyze_reference_video
from processors.storage_helpers import storage_sync
from services.job_sync import get_job_sync, update_job_sync

log = structlog.get_logger("viraedit.tasks.style_intelligence")


def _sync_db_url() -> str:
    return settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")


def _persist_template(
    template: dict,
    *,
    job_id: str,
    project_id: str,
    user_id: str,
    template_name: str,
) -> tuple[str, str]:
    """Insert template row and upload JSON to MinIO. Returns (template_id, template_key)."""
    template_id = str(uuid.uuid4())
    template_key = f"users/{user_id}/templates/{job_id}.json"
    storage_sync.put_object(
        template_key,
        json.dumps(template).encode(),
        "application/json",
    )

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
                "data": json.dumps(template),
            },
        )
    return template_id, template_key


@celery_app.task(bind=True, name="tasks.style_intelligence.analyze", time_limit=300)
def analyze_style_task(
    self: Task,
    job_id: str,
    video_key: str,
    project_id: str,
    user_id: str,
    template_name: str = "Style template",
    source_url: str | None = None,
) -> dict:
    update_job_sync(job_id, status="processing", result={"step": "analyzing_with_gemini"})
    local_path: Path | None = None

    try:
        local_path = storage_sync.download_to_temp(video_key, job_id)
        template = asyncio.run(
            analyze_reference_video(local_path, project_id, source_url=source_url)
        )
        template_id, template_key = _persist_template(
            template,
            job_id=job_id,
            project_id=project_id,
            user_id=user_id,
            template_name=template_name,
        )

        result = {
            "step": "done",
            "template_id": template_id,
            "template_key": template_key,
            "template": template,
        }
        update_job_sync(job_id, status="done", result=result)
        log.info("style_intelligence_done", job_id=job_id, template_id=template_id)
        return result

    except Exception as exc:
        update_job_sync(job_id, status="failed", error=str(exc))
        log.error("style_intelligence_failed", job_id=job_id, error=str(exc))
        raise
    finally:
        if local_path and local_path.exists():
            try:
                local_path.unlink()
            except OSError:
                pass


@celery_app.task(bind=True, name="tasks.style_intelligence.chain_download", time_limit=600)
def chain_download_then_analyze(
    self: Task,
    job_id: str,
    download_job_id: str,
    project_id: str,
    user_id: str,
    template_name: str = "Style template",
) -> None:
    """Poll ingest download job, then run Gemini style analysis."""
    update_job_sync(job_id, status="processing", result={"step": "downloading_reference"})

    for _ in range(60):
        dl_job = get_job_sync(download_job_id)
        if dl_job and dl_job.status.value == "done":
            video_key = (dl_job.result or {}).get("video_key")
            if not video_key:
                update_job_sync(job_id, status="failed", error="Download finished but no video was found.")
                return
            source_url = (dl_job.payload or {}).get("url")
            analyze_style_task.delay(
                job_id, video_key, project_id, user_id, template_name, source_url
            )
            return
        if dl_job and dl_job.status.value == "failed":
            update_job_sync(job_id, status="failed", error="Reference video download failed.")
            return
        time.sleep(5)

    update_job_sync(job_id, status="failed", error="Reference download timed out.")
