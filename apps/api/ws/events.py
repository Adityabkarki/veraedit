"""
WebSocket event schemas and pipeline stage labels.

All user-facing labels are English (app UI rule).
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4


class PipelineStage(str, Enum):
    UPLOADED = "uploaded"
    TRANSCRIPTION = "transcription"
    SCENE_DETECTION = "scene_detection"
    AUTO_EDITING = "auto_editing"
    SHORTS = "shorts"
    READY = "ready"
    ERROR = "error"


# English-only stage labels shown in dashboard / editor progress UI
STAGE_LABELS: dict[str, str] = {
    PipelineStage.UPLOADED.value: "Upload complete",
    PipelineStage.TRANSCRIPTION.value: "Transcribing audio...",
    PipelineStage.SCENE_DETECTION.value: "Finding scenes...",
    PipelineStage.AUTO_EDITING.value: "Auto-editing...",
    PipelineStage.SHORTS.value: "Extracting shorts...",
    PipelineStage.READY.value: "Ready to edit",
    PipelineStage.ERROR.value: "Processing failed",
}


def stage_label(stage: str) -> str:
    """Human-readable English label for a pipeline stage."""
    return STAGE_LABELS.get(stage, stage.replace("_", " ").title())


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def build_event(
    event_type: str,
    project_id: str,
    data: dict[str, Any],
    *,
    asset_id: str | None = None,
    render_id: str | None = None,
) -> dict[str, Any]:
    """Build a canonical WebSocket event envelope."""
    payload: dict[str, Any] = {
        "id": str(uuid4()),
        "type": event_type,
        "project_id": project_id,
        "timestamp": _now_iso(),
        "data": data,
    }
    if asset_id:
        payload["asset_id"] = asset_id
    if render_id:
        payload["render_id"] = render_id
    return payload


def build_pipeline_event(
    project_id: str,
    asset_id: str,
    *,
    stage: str,
    asset_status: str,
    progress_percent: float = 0.0,
    message: str | None = None,
) -> dict[str, Any]:
    """Pipeline progress event — drives dashboard + editor progress banners."""
    data: dict[str, Any] = {
        "stage": stage,
        "stage_label": stage_label(stage),
        "asset_status": asset_status.lower(),
        "progress_percent": round(max(0.0, min(100.0, progress_percent)), 1),
    }
    if message:
        data["message"] = message
    return build_event(
        "pipeline.progress",
        project_id,
        data,
        asset_id=asset_id,
    )


def build_pipeline_error_event(
    project_id: str,
    asset_id: str,
    *,
    stage: str,
    message: str,
) -> dict[str, Any]:
    """Pipeline failure event."""
    return build_event(
        "pipeline.error",
        project_id,
        {
            "stage": stage,
            "stage_label": stage_label(stage),
            "message": message,
        },
        asset_id=asset_id,
    )


def build_render_progress_event(
    project_id: str,
    render_id: str,
    *,
    status: str,
    progress_percent: float,
    message: str | None = None,
) -> dict[str, Any]:
    """Render queue progress event."""
    data: dict[str, Any] = {
        "status": status.lower(),
        "progress_percent": round(max(0.0, min(100.0, progress_percent)), 1),
    }
    if message:
        data["message"] = message
    return build_event(
        "render.progress",
        project_id,
        data,
        render_id=render_id,
    )


def redis_channel_for_project(project_id: str) -> str:
    """Redis pub/sub channel for a project."""
    return f"viraedit:ws:project:{project_id}"
