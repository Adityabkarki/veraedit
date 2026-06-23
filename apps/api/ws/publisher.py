"""
Publish WebSocket events via Redis pub/sub.

Celery workers call these sync helpers; the FastAPI process forwards
messages to connected WebSocket clients.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from config import settings
from ws.events import (
    PipelineStage,
    build_pipeline_error_event,
    build_pipeline_event,
    build_render_progress_event,
    redis_channel_for_project,
)

log = logging.getLogger("viraedit.ws.publisher")


def publish_ws_event(project_id: str, event: dict[str, Any]) -> bool:
    """
    Publish an event to Redis for WebSocket delivery.

    Returns False if Redis is unavailable (non-fatal for workers).
    """
    if not project_id:
        return False
    try:
        import redis

        client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        channel = redis_channel_for_project(project_id)
        client.publish(channel, json.dumps(event, ensure_ascii=False))
        client.close()
        return True
    except Exception as exc:
        log.warning("ws_publish_failed: project=%s error=%s", project_id, exc)
        return False


def emit_pipeline_progress(
    project_id: str,
    asset_id: str,
    *,
    stage: str,
    asset_status: str,
    progress_percent: float = 0.0,
    message: str | None = None,
) -> bool:
    """Emit a pipeline progress event."""
    event = build_pipeline_event(
        project_id,
        asset_id,
        stage=stage,
        asset_status=asset_status,
        progress_percent=progress_percent,
        message=message,
    )
    return publish_ws_event(project_id, event)


def emit_pipeline_error(
    project_id: str,
    asset_id: str,
    *,
    stage: str,
    message: str,
) -> bool:
    """Emit a pipeline error event."""
    event = build_pipeline_error_event(
        project_id,
        asset_id,
        stage=stage,
        message=message,
    )
    return publish_ws_event(project_id, event)


def emit_render_progress(
    project_id: str,
    render_id: str,
    *,
    status: str,
    progress_percent: float,
    message: str | None = None,
) -> bool:
    """Emit a render progress event."""
    event = build_render_progress_event(
        project_id,
        render_id,
        status=status,
        progress_percent=progress_percent,
        message=message,
    )
    return publish_ws_event(project_id, event)


def asset_status_to_stage(status: str) -> str:
    """Map asset DB status to pipeline stage key."""
    s = (status or "").lower()
    mapping = {
        "uploaded": PipelineStage.UPLOADED.value,
        "transcribing": PipelineStage.TRANSCRIPTION.value,
        "analyzing": PipelineStage.SCENE_DETECTION.value,
        "ready": PipelineStage.READY.value,
        "error": PipelineStage.ERROR.value,
    }
    return mapping.get(s, PipelineStage.SCENE_DETECTION.value)
