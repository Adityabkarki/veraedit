"""Tests for B-roll → motion-graphic fallback (Fallback Guarantee Law)."""
from __future__ import annotations

from services.director.resolve_broll import resolve_broll_entries


def _timeline_with_broll(query: str = "Growth strategy") -> dict:
    return {
        "schemaVersion": 1,
        "projectId": "p1",
        "contentType": "podcast",
        "fps": 30,
        "durationInFrames": 900,
        "tracks": {
            "broll": [
                {
                    "id": "broll-1",
                    "startFrame": 60,
                    "durationInFrames": 120,
                    "source": "pexels",
                    "assetUrl": "",
                    "searchQuery": query,
                    "triggerId": "topic_shift-60000",
                }
            ],
            "motionGraphics": [],
        },
        "triggers": [
            {
                "id": "topic_shift-60000",
                "type": "topic_shift",
                "transcriptStart": 2.0,
                "transcriptEnd": 6.0,
                "confidence": 0.8,
                "status": "realized",
                "resultingEntryId": "broll-1",
            }
        ],
    }


def test_broll_failure_converts_to_motion_graphic(monkeypatch):
    monkeypatch.setattr(
        "services.director.resolve_broll.search_pexels",
        lambda *args, **kwargs: [],
    )
    timeline = _timeline_with_broll()
    result = resolve_broll_entries(timeline, content_type="podcast")

    assert result["tracks"]["broll"] == []
    assert len(result["tracks"]["motionGraphics"]) == 1
    mg = result["tracks"]["motionGraphics"][0]
    assert mg["componentId"] == "topic_title_card"
    trigger = result["triggers"][0]
    assert trigger["status"] == "realized"
    assert trigger["metadata"]["fallbackTier"] == "broll_to_mg"


def test_broll_query_appends_mood_keywords(monkeypatch):
    captured: dict = {}

    def fake_search(query, **kwargs):
        captured["query"] = query
        return []

    monkeypatch.setattr("services.director.resolve_broll.search_pexels", fake_search)
    timeline = _timeline_with_broll("leadership")
    theme = {"meta": {"brollMoodKeywords": ["corporate", "professional"]}}
    resolve_broll_entries(timeline, content_type="podcast", theme=theme)
    assert "corporate" in captured.get("query", "")
