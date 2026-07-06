"""Tests for Director Phase 5 timeline validation."""
from __future__ import annotations

from services.director.validate_timeline import validate_director_timeline


def _minimal_valid_timeline(content_type: str = "podcast") -> dict:
    grade = {
        "podcast": {"contrast": 0.1, "saturation": -0.05, "warmth": 0.15, "vignetteIntensity": 0.2, "grainIntensity": 0.08, "blendMode": "overlay"},
        "consultancy": {"contrast": 0.05, "saturation": -0.1, "warmth": -0.05, "vignetteIntensity": 0.0, "grainIntensity": 0.0, "blendMode": "normal"},
        "social": {"contrast": 0.25, "saturation": 0.2, "warmth": 0.05, "vignetteIntensity": 0.1, "grainIntensity": 0.05, "blendMode": "overlay"},
        "showcase": {"contrast": 0.1, "saturation": 0.05, "warmth": 0.0, "vignetteIntensity": 0.0, "grainIntensity": 0.0, "blendMode": "normal"},
    }[content_type]

    return {
        "schemaVersion": 1,
        "projectId": "test-proj",
        "contentType": content_type,
        "fps": 30,
        "durationInFrames": 900,
        "width": 1920 if content_type != "social" else 1080,
        "height": 1080 if content_type != "social" else 1920,
        "theme": {"grade": grade},
        "tracks": {
            "video": [{"id": "v1", "assetId": "asset-1", "startFrame": 0, "durationInFrames": 900}],
            "audio": [],
            "captions": [],
            "broll": [],
            "motionGraphics": [
                {
                    "id": "mg1",
                    "componentId": "broadcast_lower_third",
                    "startFrame": 0,
                    "durationInFrames": 90,
                    "layerDepth": 55,
                    "props": {},
                    "triggerId": "t1",
                }
            ],
            "transitions": [],
            "vfx": [],
            "sfx": [],
            "multicam": [],
        },
        "triggers": [
            {
                "id": "t1",
                "type": "episode_start",
                "transcriptStart": 0,
                "transcriptEnd": 3,
                "confidence": 0.95,
                "status": "realized",
                "resultingEntryId": "mg1",
            }
        ],
    }


def test_validate_passes_minimal_podcast_timeline():
    report = validate_director_timeline(_minimal_valid_timeline("podcast"))
    assert report.passed
    assert report.to_dict()["errorCount"] == 0


def test_validate_fails_empty_broll_url():
    tl = _minimal_valid_timeline("podcast")
    tl["tracks"]["broll"] = [
        {"id": "b1", "assetUrl": "", "triggerId": "t2", "startFrame": 0, "durationInFrames": 30}
    ]
    tl["triggers"].append(
        {
            "id": "t2",
            "type": "topic_shift",
            "status": "realized",
            "resultingEntryId": "b1",
            "transcriptStart": 10,
            "transcriptEnd": 15,
            "confidence": 0.8,
        }
    )
    report = validate_director_timeline(tl)
    assert not report.passed
    assert any(c.id.startswith("broll_asset_url") and not c.passed for c in report.checks)


def test_validate_fails_glitch_too_long():
    tl = _minimal_valid_timeline("social")
    tl["tracks"]["transitions"] = [
        {"id": "tr1", "type": "glitch_cut", "atFrame": 30, "durationInFrames": 12, "easing": "linear"}
    ]
    report = validate_director_timeline(tl)
    assert not report.passed
    assert any(c.id.startswith("glitch_transition") and not c.passed for c in report.checks)


def test_validate_all_four_content_type_grades():
    for pillar in ("podcast", "consultancy", "social", "showcase"):
        report = validate_director_timeline(_minimal_valid_timeline(pillar))
        assert report.passed, f"{pillar} failed: {[c.message for c in report.checks if not c.passed]}"


def test_manual_checks_listed():
    report = validate_director_timeline(_minimal_valid_timeline())
    assert len(report.manual_checks) >= 5
    assert any(m["id"] == "ducking_sounds_natural" for m in report.manual_checks)
