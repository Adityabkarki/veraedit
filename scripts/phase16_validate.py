#!/usr/bin/env python3
"""
Phase 16 — Production Completeness validation (Podcast + Consultancy).

Runs synthetic Director compile → B-roll resolve → export readiness gate.
For full Phase 7 proof, re-run against real uploads with PEXELS_API_KEY set.

Usage:
  python scripts/phase16_validate.py
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(REPO / "apps" / "api"))

from services.director.content_type_map import default_dimensions  # noqa: E402
from services.director.export_readiness import check_export_readiness  # noqa: E402
from services.director.resolve_broll import resolve_broll_entries  # noqa: E402
from services.director.validate_timeline import validate_director_timeline  # noqa: E402
from tests.fixtures.director_phase5_signals import PHASE5_FIXTURES  # noqa: E402

COMPILE_SCRIPT = REPO / "remotion-service" / "scripts" / "compile-director.ts"
DEFAULT_THEME = {
    "schemaVersion": 1,
    "colors": {
        "primary": "#C41E3A",
        "secondary": "#111113",
        "accent": "#F59E0B",
        "background": "#111113",
        "surface": "#111113",
        "onPrimary": "#FFFFFF",
        "onSurface": "#F8FAFC",
        "onBackground": "#F8FAFC",
    },
    "typography": {
        "headingFont": "Inter",
        "bodyFont": "Inter",
        "devanagariFont": "Noto Sans Devanagari",
        "weightScale": {"heading": 700, "body": 400},
    },
    "motion": {"defaultCurve": "elegant_glide"},
    "grade": {
        "contrast": 0.05,
        "saturation": -0.1,
        "warmth": 0.12,
        "vignetteIntensity": 0.0,
        "grainIntensity": 0.0,
        "blendMode": "normal",
    },
    "meta": {"source": "manual", "styleDepthOk": True},
}


def _tsx_available() -> bool:
    return shutil.which("npx") is not None and COMPILE_SCRIPT.exists()


def _compile(content_type: str, signals: dict) -> dict:
    w, h = default_dimensions(content_type)
    payload = {
        "projectId": f"phase16-{content_type}",
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
        cwd=REPO / "remotion-service",
        timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)
    result = json.loads(proc.stdout)
    if not result.get("success"):
        raise RuntimeError(result.get("error", "compile failed"))
    return result["timeline"]


def _mock_pexels(query: str, count: int = 3, orientation: str = "landscape"):
    return []


def validate_pillar(content_type: str) -> dict:
    signals = PHASE5_FIXTURES[content_type]
    timeline = _compile(content_type, signals)
    with patch("services.director.resolve_broll.search_pexels", side_effect=_mock_pexels):
        timeline = resolve_broll_entries(timeline, content_type=content_type, theme=DEFAULT_THEME)

    validation = validate_director_timeline(timeline)
    readiness, _ = check_export_readiness(timeline, auto_resolve=False)
    _, after_fix = check_export_readiness(timeline, auto_resolve=True)
    readiness_after, _ = check_export_readiness(after_fix, auto_resolve=False)

    failed_validation = [
        c.message
        for c in validation.checks
        if not c.passed and c.severity == "error"
    ]

    realized = sum(1 for t in timeline.get("triggers", []) if t.get("status") == "realized")
    fallbacks = sum(
        1
        for t in timeline.get("triggers", [])
        if (t.get("metadata") or {}).get("fallbackTier")
    )

    unresolved = sum(1 for i in readiness.issues if not i.resolved)
    unresolved_after = sum(1 for i in readiness_after.issues if not i.resolved)

    return {
        "contentType": content_type,
        "validationPassed": validation.passed,
        "validationFailures": failed_validation,
        "readinessBeforeFix": readiness.ready,
        "unresolvedBeforeFix": unresolved,
        "autoFixesAvailable": sum(1 for i in readiness.issues if i.auto_resolvable),
        "readinessAfterAutoFix": readiness_after.ready,
        "unresolvedAfterAutoFix": unresolved_after,
        "realizedTriggers": realized,
        "fallbackTriggers": fallbacks,
        "checklist": readiness.checklist,
    }


def main() -> int:
    if not _tsx_available():
        print("SKIP: npx/tsx or compile-director.ts unavailable")
        return 0

    print("Phase 16 — Production Completeness validation\n")
    exit_code = 0
    for pillar in ("podcast", "consultancy"):
        try:
            report = validate_pillar(pillar)
            print(json.dumps(report, indent=2))
            if not report["validationPassed"]:
                print(f"FAIL: {pillar} failed Phase 5 validation")
                exit_code = 1
            if report["realizedTriggers"] == 0:
                print(f"FAIL: {pillar} has no realized triggers")
                exit_code = 1
            print()
        except Exception as exc:
            print(f"FAIL: {pillar} — {exc}")
            exit_code = 1

    if exit_code == 0:
        print("Phase 16 synthetic pipeline OK.")
        print("Next: run one real Podcast + Consultancy upload through export (Phase 7 manual proof).")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
