"""Tests for pre-export completeness gate."""
from __future__ import annotations

from services.director.export_readiness import STATIC_STRETCH_SECONDS, check_export_readiness


def _base_timeline(duration_frames: int = 3000, fps: int = 30) -> dict:
    return {
        "schemaVersion": 1,
        "projectId": "p1",
        "contentType": "podcast",
        "fps": fps,
        "durationInFrames": duration_frames,
        "width": 1920,
        "height": 1080,
        "theme": {"grade": {}, "motion": {"defaultCurve": "elegant_glide"}, "meta": {"styleDepthOk": True}},
        "tracks": {
            "motionGraphics": [],
            "broll": [],
            "transitions": [],
            "vfx": [],
            "multicam": [],
            "video": [],
            "audio": [],
            "captions": [],
            "sfx": [],
        },
        "triggers": [],
    }


def test_flags_long_static_stretch():
    duration = int((STATIC_STRETCH_SECONDS + 10) * 30)
    timeline = _base_timeline(duration_frames=duration)
    report, _ = check_export_readiness(timeline)
    assert report.ready is False
    assert any(i.kind == "static_stretch" for i in report.issues)


def test_auto_resolve_inserts_title_card():
    duration = int((STATIC_STRETCH_SECONDS + 10) * 30)
    timeline = _base_timeline(duration_frames=duration)
    report, fixed = check_export_readiness(timeline, auto_resolve=True)
    assert report.auto_fixes_applied >= 1
    assert len(fixed["tracks"]["motionGraphics"]) >= 1
    assert fixed["tracks"]["motionGraphics"][0]["componentId"] == "topic_title_card"


def test_auto_resolve_ken_burns_when_video_covers_stretch():
    duration = int((STATIC_STRETCH_SECONDS + 10) * 30)
    timeline = _base_timeline(duration_frames=duration)
    timeline["tracks"]["video"] = [
        {
            "id": "v-main",
            "assetId": "asset-1",
            "startFrame": 0,
            "durationInFrames": duration,
            "sourceStartSeconds": 0,
            "sourceEndSeconds": duration / 30,
            "speed": 1,
        }
    ]
    report, fixed = check_export_readiness(timeline, auto_resolve=True)
    assert report.auto_fixes_applied >= 1
    assert fixed["tracks"]["video"][0].get("cameraMotion", {}).get("type") == "ken_burns"


def test_ready_when_visuals_present():
    timeline = _base_timeline(duration_frames=900)
    timeline["tracks"]["motionGraphics"] = [
        {"id": "mg1", "startFrame": 0, "durationInFrames": 450, "componentId": "topic_title_card"},
        {"id": "mg2", "startFrame": 450, "durationInFrames": 450, "componentId": "pull_quote_card"},
    ]
    report, _ = check_export_readiness(timeline)
    assert report.ready is True
