"""Unit tests for WebSocket event schemas (EP-6.1)."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

from ws.events import (
    PipelineStage,
    build_pipeline_event,
    build_render_progress_event,
    redis_channel_for_project,
    stage_label,
)


def test_stage_labels_are_english():
    assert stage_label(PipelineStage.TRANSCRIPTION.value) == "Transcribing audio..."
    assert stage_label(PipelineStage.SCENE_DETECTION.value) == "Finding scenes..."
    assert stage_label(PipelineStage.READY.value) == "Ready to edit"


def test_build_pipeline_event_envelope():
    event = build_pipeline_event(
        "proj-1",
        "asset-1",
        stage=PipelineStage.AUTO_EDITING.value,
        asset_status="analyzing",
        progress_percent=62.5,
    )
    assert event["type"] == "pipeline.progress"
    assert event["project_id"] == "proj-1"
    assert event["asset_id"] == "asset-1"
    assert event["data"]["stage"] == "auto_editing"
    assert event["data"]["progress_percent"] == 62.5
    assert "timestamp" in event


def test_build_render_progress_event():
    event = build_render_progress_event(
        "proj-1",
        "render-1",
        status="processing",
        progress_percent=44.0,
    )
    assert event["type"] == "render.progress"
    assert event["render_id"] == "render-1"
    assert event["data"]["status"] == "processing"


def test_redis_channel_format():
    assert redis_channel_for_project("abc-123") == "viraedit:ws:project:abc-123"
