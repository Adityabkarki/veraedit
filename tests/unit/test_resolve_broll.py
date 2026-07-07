"""Tests for Director B-roll resolution — No-Empty-Asset Law."""
from __future__ import annotations

from unittest.mock import patch

from services.director.resolve_broll import resolve_broll_entries, reroll_broll_with_pexels


def _timeline_with_broll():
    return {
        "triggers": [
            {
                "id": "topic_shift-1000",
                "type": "topic_shift",
                "status": "realized",
                "resultingEntryId": "entry-topic_shift-1000",
            }
        ],
        "tracks": {
            "broll": [
                {
                    "id": "entry-topic_shift-1000",
                    "triggerId": "topic_shift-1000",
                    "assetUrl": "",
                    "searchQuery": "mountain landscape",
                }
            ]
        },
    }


@patch("services.director.resolve_broll.search_pexels")
def test_resolve_broll_populates_asset_url(mock_search):
    mock_search.return_value = [
        {"id": 1, "video_url": "https://videos.pexels.com/example.mp4", "thumbnail_url": ""}
    ]
    result = resolve_broll_entries(_timeline_with_broll(), content_type="podcast")
    broll = result["tracks"]["broll"]
    assert broll[0]["assetUrl"] == "https://videos.pexels.com/example.mp4"
    assert result["triggers"][0]["status"] == "realized"


@patch("services.director.resolve_broll.search_pexels")
def test_resolve_broll_falls_back_to_mg_when_no_match(mock_search):
    mock_search.return_value = []
    result = resolve_broll_entries(_timeline_with_broll(), content_type="podcast")
    assert result["tracks"]["broll"] == []
    assert len(result["tracks"]["motionGraphics"]) == 1
    trigger = result["triggers"][0]
    assert trigger["status"] == "realized"
    assert trigger["metadata"]["fallbackTier"] == "broll_to_mg"


@patch("services.director.resolve_broll.search_pexels")
def test_reroll_broll_falls_back_on_empty_results(mock_search):
    mock_search.return_value = []
    timeline = _timeline_with_broll()
    result = reroll_broll_with_pexels(
        timeline,
        "entry-topic_shift-1000",
        "ocean waves",
        content_type="podcast",
    )
    assert result["tracks"]["broll"] == []
    assert len(result["tracks"]["motionGraphics"]) == 1
    assert result["triggers"][0]["status"] == "realized"
