"""
ViraEdit — Template-based final render Celery task (Phase 06).
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import structlog
from celery import Task

from celery_app import celery_app
from processors.storage_helpers import storage_sync
from processors.template_renderer import render_video_from_template
from services.job_sync import update_job_sync

log = structlog.get_logger("viraedit.tasks.render_from_template")

PRESIGNED_EXPIRY_SECONDS = 86400


@celery_app.task(bind=True, name="tasks.render.from_template", time_limit=900)
def render_from_template_task(
    self: Task,
    job_id: str,
    project_id: str,
    template: dict,
    resolved_assets: dict,
    text_values: dict,
) -> dict:
    work_dir: Path | None = None
    try:
        update_job_sync(job_id, status="processing", result={"step": "assembling"})
        work_dir = Path(tempfile.gettempdir()) / "viraedit" / job_id / "render_work"
        assembled_path = render_video_from_template(
            template,
            resolved_assets,
            text_values,
            work_dir,
        )

        final_key = f"projects/{project_id}/final/{job_id}.mp4"
        storage_sync.put_file(final_key, Path(assembled_path), "video/mp4")
        url = storage_sync.get_presigned_url(final_key, expires=PRESIGNED_EXPIRY_SECONDS)

        result = {
            "key": final_key,
            "url": url,
            "captions_included": False,
            "caption_note": (
                "Auto-captions are not baked into template renders yet. "
                "Use Add captions in the editor after download."
            ),
        }
        update_job_sync(job_id, status="done", result=result)
        log.info("render_from_template_done", job_id=job_id)
        return result
    except Exception as exc:
        update_job_sync(job_id, status="failed", error=str(exc))
        log.error("render_from_template_failed", job_id=job_id, error=str(exc))
        raise
    finally:
        if work_dir and work_dir.exists():
            shutil.rmtree(work_dir, ignore_errors=True)
