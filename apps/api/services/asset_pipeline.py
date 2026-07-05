"""Queue post-upload Celery work (edit proxy + transcription)."""

from __future__ import annotations

import uuid

import structlog

from models.asset import Asset, AssetStatus, ProxyStatus
from services.asset_media import should_generate_proxy

log = structlog.get_logger("viraedit.asset_pipeline")


def queue_post_upload_tasks(asset: Asset) -> tuple[bool, bool]:
    """
    Queue edit-proxy and transcription tasks for an uploaded video asset.

    Returns:
        (proxy_queued, transcription_queued)
    """
    asset_id = str(asset.id)
    proxy_queued = False
    transcription_queued = False

    if should_generate_proxy(asset):
        try:
            from tasks.proxy_tasks import queue_edit_proxy

            queue_edit_proxy(asset_id)
            proxy_queued = True
            log.info("edit_proxy_queued", asset_id=asset_id)
        except Exception as exc:
            log.warning(
                "edit_proxy_queue_failed",
                asset_id=asset_id,
                error=str(exc),
            )

    try:
        from celery_app import celery_app as _celery

        _celery.send_task(
            "tasks.transcribe.run",
            kwargs={"asset_id": asset_id},
            queue="transcription",
        )
        transcription_queued = True
        log.info("transcription_queued", asset_id=asset_id)
    except Exception as exc:
        log.warning(
            "transcription_queue_failed",
            asset_id=asset_id,
            error=str(exc),
            hint="Start the Celery worker: scripts/worker.sh or scripts/worker.bat all",
        )

    return proxy_queued, transcription_queued


def queue_multicam_sync_if_needed(project_id: uuid.UUID) -> bool:
    """Queue multicam alignment when a project may have multiple camera feeds."""
    try:
        from celery_app import celery_app as _celery

        _celery.send_task(
            "tasks.multicam_sync.sync_project",
            kwargs={"project_id": str(project_id)},
            queue="default",
        )
        log.info("multicam_sync_queued", project_id=str(project_id))
        return True
    except Exception as exc:
        log.warning("multicam_sync_queue_failed", project_id=str(project_id), error=str(exc))
        return False


def needs_pipeline_kick(asset: Asset, *, has_transcript: bool) -> bool:
    """True when upload finished but background work likely never started."""
    if asset.status not in (AssetStatus.UPLOADED, AssetStatus.TRANSCRIBING):
        return False
    proxy_pending = (
        should_generate_proxy(asset)
        and asset.proxy_status in (None, ProxyStatus.PENDING, ProxyStatus.FAILED)
    )
    return proxy_pending or not has_transcript
