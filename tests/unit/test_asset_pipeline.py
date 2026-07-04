"""Unit tests for services/asset_pipeline.py."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from models.asset import AssetStatus, ProxyStatus
from services.asset_pipeline import needs_pipeline_kick, queue_post_upload_tasks


def _asset(**kwargs):
    asset = MagicMock()
    asset.id = kwargs.get("id", "asset-1")
    asset.status = kwargs.get("status", AssetStatus.UPLOADED)
    asset.proxy_status = kwargs.get("proxy_status", ProxyStatus.PENDING)
    return asset


@patch("services.asset_pipeline.should_generate_proxy", return_value=True)
@patch("tasks.proxy_tasks.queue_edit_proxy")
@patch("celery_app.celery_app.send_task")
def test_queue_post_upload_tasks(mock_send, mock_proxy, _mock_should):
    proxy_queued, transcription_queued = queue_post_upload_tasks(_asset())
    assert proxy_queued is True
    assert transcription_queued is True
    mock_proxy.assert_called_once_with("asset-1")
    mock_send.assert_called_once()


def test_needs_pipeline_kick_when_uploaded_without_transcript():
    assert needs_pipeline_kick(_asset(), has_transcript=False) is True


def test_needs_pipeline_kick_false_when_ready():
    assert (
        needs_pipeline_kick(
            _asset(status=AssetStatus.READY, proxy_status=ProxyStatus.READY),
            has_transcript=True,
        )
        is False
    )
