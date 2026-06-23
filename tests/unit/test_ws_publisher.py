"""Unit tests for WebSocket publisher (EP-6.1)."""
import json
import sys
import os
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

from ws.events import PipelineStage
from ws.publisher import emit_pipeline_progress, publish_ws_event


def test_publish_ws_event_publishes_json():
    mock_client = MagicMock()
    with patch("redis.from_url", return_value=mock_client):
        ok = publish_ws_event("proj-1", {"type": "test", "data": {}})
    assert ok is True
    mock_client.publish.assert_called_once()
    channel, payload = mock_client.publish.call_args[0]
    assert channel == "viraedit:ws:project:proj-1"
    assert json.loads(payload)["type"] == "test"
    mock_client.close.assert_called_once()


def test_publish_ws_event_returns_false_without_project_id():
    assert publish_ws_event("", {"type": "test"}) is False


def test_emit_pipeline_progress_builds_event():
    mock_client = MagicMock()
    with patch("redis.from_url", return_value=mock_client):
        ok = emit_pipeline_progress(
            "proj-1",
            "asset-1",
            stage=PipelineStage.TRANSCRIPTION.value,
            asset_status="transcribing",
            progress_percent=15,
        )
    assert ok is True
    _, payload = mock_client.publish.call_args[0]
    data = json.loads(payload)
    assert data["type"] == "pipeline.progress"
    assert data["data"]["stage_label"] == "Transcribing audio..."
