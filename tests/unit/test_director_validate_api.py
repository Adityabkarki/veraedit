"""Tests for Director validate API helpers."""
from services.director.validate_timeline import validate_director_timeline


def test_validate_report_serializes():
    timeline = {
        "schemaVersion": 1,
        "projectId": "p",
        "contentType": "consultancy",
        "fps": 30,
        "durationInFrames": 100,
        "width": 1920,
        "height": 1080,
        "theme": {
            "grade": {
                "contrast": 0.05,
                "saturation": -0.1,
                "warmth": -0.05,
                "vignetteIntensity": 0.0,
                "grainIntensity": 0.0,
                "blendMode": "normal",
            }
        },
        "tracks": {
            "video": [{"id": "v1", "assetId": "a1", "startFrame": 0, "durationInFrames": 100}],
            "audio": [],
            "captions": [],
            "broll": [],
            "motionGraphics": [],
            "transitions": [],
            "vfx": [],
            "sfx": [],
            "multicam": [],
        },
        "triggers": [],
    }
    report = validate_director_timeline(timeline)
    data = report.to_dict()
    assert "passed" in data
    assert "manualChecks" in data
    assert isinstance(data["checks"], list)
