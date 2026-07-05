"""Celery task — auto-sync multicam feeds when a project has multiple videos."""
from __future__ import annotations

import structlog

from celery_app import celery_app
from services.multicam.project_feeds import sync_project_multicam_feeds_sync

log = structlog.get_logger("viraedit.tasks.multicam_sync")


@celery_app.task(name="tasks.multicam_sync.sync_project", bind=True, max_retries=2)
def sync_project_multicam(self, project_id: str) -> dict:
    """Align camera feeds after upload when 2+ video assets exist."""
    try:
        return sync_project_multicam_feeds_sync(project_id)
    except Exception as exc:
        log.warning("multicam_sync_task_failed", project_id=project_id, error=str(exc))
        raise self.retry(exc=exc, countdown=30) from exc
