"""Tests for unified director export bridge."""
from unittest.mock import AsyncMock, patch

import pytest

from services.director.legacy_timeline_bridge import bridge_editor_timeline_to_director


@pytest.mark.asyncio
async def test_bridge_editor_timeline_calls_remotion_service():
    timeline = {
        "tracks": [
            {
                "type": "video",
                "clips": [
                    {
                        "id": "v1",
                        "asset_id": "a1",
                        "timeline_start": 0,
                        "timeline_end": 5,
                    }
                ],
            }
        ]
    }
    bridged = {
        "projectId": "p1",
        "tracks": {"video": [{"id": "v1"}], "motionGraphics": []},
    }

    mock_resp = AsyncMock()
    mock_resp.json = lambda: {"success": True, "timeline": bridged}
    mock_resp.raise_for_status = lambda: None

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("services.director.legacy_timeline_bridge.httpx.AsyncClient", return_value=mock_client):
        result = await bridge_editor_timeline_to_director(
            timeline, project_id="p1",
        )

    assert result["projectId"] == "p1"
    mock_client.post.assert_awaited_once()
