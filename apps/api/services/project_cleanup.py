"""
Hard-delete all MinIO objects and revoke in-flight Celery jobs for a project.

Called before the project row is removed so DB cascade can clean relational data.
Storage deletion is best-effort — missing keys are ignored.
"""
from __future__ import annotations

import uuid
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Asset, Render
from models.render import RenderStatus
from storage import BUCKET_MEDIA, BUCKET_RENDERS, BUCKET_TEMP, StorageService

log = structlog.get_logger("viraedit.project_cleanup")


async def _revoke_celery_task(task_id: str | None) -> None:
    if not task_id:
        return
    try:
        from celery_app import celery_app

        celery_app.control.revoke(task_id, terminate=True)
        log.info("celery_task_revoked", task_id=task_id)
    except Exception as exc:
        log.warning("celery_revoke_failed", task_id=task_id, error=str(exc))


async def purge_project_storage(
    project_id: uuid.UUID,
    db: AsyncSession,
    storage: StorageService,
) -> dict[str, Any]:
    """
    Delete every object tied to a project from MinIO and revoke background jobs.

    Returns a summary dict for logging/tests.
    """
    pid = str(project_id)
    prefix = f"projects/{pid}/"

    asset_rows = await db.execute(
        select(Asset.celery_transcription_task_id, Asset.celery_analysis_task_id).where(
            Asset.project_id == project_id
        )
    )
    for trans_id, analysis_id in asset_rows.all():
        await _revoke_celery_task(trans_id)
        await _revoke_celery_task(analysis_id)

    render_rows = await db.execute(
        select(Render.celery_task_id, Render.storage_key, Render.status).where(
            Render.project_id == project_id
        )
    )
    render_keys: list[str] = []
    for celery_id, storage_key, status in render_rows.all():
        if status in (RenderStatus.QUEUED, RenderStatus.PROCESSING):
            await _revoke_celery_task(celery_id)
        if storage_key:
            render_keys.append(storage_key)

    media_deleted = await storage.delete_prefix(prefix, bucket=BUCKET_MEDIA)
    temp_deleted = await storage.delete_prefix(prefix, bucket=BUCKET_TEMP)

    renders_deleted = 0
    for key in render_keys:
        await storage.delete_object(key, bucket=BUCKET_RENDERS)
        renders_deleted += 1

    summary = {
        "project_id": pid,
        "media_objects_deleted": media_deleted,
        "temp_objects_deleted": temp_deleted,
        "render_objects_deleted": renders_deleted,
    }
    log.info("project_storage_purged", **summary)
    return summary
