"""Phase 5 — compile + validate all four content pillars (synthetic signals)."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest

from services.director.content_type_map import default_dimensions
from services.director.resolve_broll import resolve_broll_entries
from services.director.validate_timeline import validate_director_timeline
from tests.fixtures.director_phase5_signals import PHASE5_FIXTURES

REPO_ROOT = Path(__file__).resolve().parents[2]
COMPILE_SCRIPT = REPO_ROOT / "remotion-service" / "scripts" / "compile-director.ts"
DEFAULT_THEME = {
    "primary": "#C41E3A",
    "secondary": "#111113",
    "accent": "#F59E0B",
    "fontFamily": "Montserrat",
    "grade": {
        "contrast": 0.05,
        "saturation": -0.1,
        "warmth": -0.05,
        "vignetteIntensity": 0.0,
        "grainIntensity": 0.0,
        "blendMode": "normal",
    },
}


def _tsx_available() -> bool:
    return shutil.which("npx") is not None and COMPILE_SCRIPT.exists()


def _compile_via_tsx(content_type: str, signals: dict) -> dict:
    w, h = default_dimensions(content_type)
    payload = {
        "projectId": f"phase5-{content_type}",
        "contentType": content_type,
        "fps": 30,
        "durationSeconds": signals["durationSeconds"],
        "width": w,
        "height": h,
        "theme": DEFAULT_THEME,
        "signals": signals,
        "density": "balanced",
        "sourceAssetId": "synthetic-asset",
    }
    proc = subprocess.run(
        ["npx", "tsx", COMPILE_SCRIPT.as_posix()],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        cwd=REPO_ROOT / "remotion-service",
        timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)
    result = json.loads(proc.stdout)
    if not result.get("success"):
        raise RuntimeError(result.get("error", "compile failed"))
    return result["timeline"]


@pytest.mark.skipif(not _tsx_available(), reason="npx/tsx or compile script unavailable")
@pytest.mark.parametrize("content_type", ["podcast", "consultancy", "social", "showcase"])
@patch(
    "services.director.resolve_broll.search_pexels",
    return_value=[{"id": 1, "video_url": "https://videos.pexels.com/test.mp4", "thumbnail_url": ""}],
)
def test_phase5_synthetic_compile_validates(mock_pexels, content_type: str):
    """Each pillar compiles and passes automated Phase 5 checks."""
    signals = PHASE5_FIXTURES[content_type]
    timeline = _compile_via_tsx(content_type, signals)
    timeline = resolve_broll_entries(timeline, content_type=content_type)
    report = validate_director_timeline(timeline)

    failed = [c for c in report.checks if not c.passed and c.severity == "error"]
    assert report.passed, f"{content_type} validation failed: {[c.message for c in failed]}"
    assert timeline.get("theme", {}).get("grade")
    assert any(t.get("status") == "realized" for t in timeline.get("triggers", []))
