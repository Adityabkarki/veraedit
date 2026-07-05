"""Cuts Motion Engine — pacing-aware cut planning."""
from __future__ import annotations

from typing import Any

PACING_PRESETS: dict[str, dict[str, Any]] = {
    "relaxed": {
        "silenceTrimThresholdMs": 1200,
        "minClipDurationFrames": 60,
        "defaultTransitionDurationFrames": 20,
        "maxCameraMotionIntensity": 0.05,
        "speedRampOnFiller": False,
    },
    "balanced": {
        "silenceTrimThresholdMs": 700,
        "minClipDurationFrames": 30,
        "defaultTransitionDurationFrames": 12,
        "maxCameraMotionIntensity": 0.08,
        "speedRampOnFiller": False,
    },
    "aggressive": {
        "silenceTrimThresholdMs": 350,
        "minClipDurationFrames": 12,
        "defaultTransitionDurationFrames": 6,
        "maxCameraMotionIntensity": 0.12,
        "speedRampOnFiller": True,
    },
}

DEFAULT_PACING_BY_CONTENT: dict[str, str] = {
    "podcast": "relaxed",
    "consultancy": "balanced",
    "social": "aggressive",
    "showcase": "balanced",
}


def plan_silence_cuts_for_profile(
    silences: list[dict],
    profile_name: str = "balanced",
) -> list[dict[str, Any]]:
    """Plan silence cuts using PacingProfile thresholds."""
    preset = PACING_PRESETS.get(profile_name, PACING_PRESETS["balanced"])
    threshold_sec = preset["silenceTrimThresholdMs"] / 1000.0
    cuts: list[dict[str, Any]] = []
    for s in silences:
        start = float(s.get("start", 0))
        end = float(s.get("end", start))
        if end - start < threshold_sec:
            continue
        cuts.append(
            {
                "type": "silence_cut",
                "start": round(start, 3),
                "end": round(end, 3),
                "durationSaved": round(end - start, 3),
                "profile": profile_name,
            }
        )
    return cuts


def plan_cuts_payload(
    *,
    silences: list[dict] | None = None,
    fillers: list[dict] | None = None,
    content_type: str = "podcast",
    profile_name: str | None = None,
) -> dict[str, Any]:
    """Unified cut plan for the Director / Cuts engine."""
    profile = profile_name or DEFAULT_PACING_BY_CONTENT.get(content_type, "balanced")
    preset = PACING_PRESETS[profile]
    silence_cuts = plan_silence_cuts_for_profile(silences or [], profile)

    filler_cuts: list[dict[str, Any]] = []
    if preset["speedRampOnFiller"]:
        for f in fillers or []:
            filler_cuts.append(
                {
                    "type": "filler_speed_ramp",
                    "start": float(f.get("start", 0)),
                    "end": float(f.get("end", 0)),
                    "playbackRate": 1.6,
                    "words": f.get("words", []),
                }
            )
    else:
        for f in fillers or []:
            filler_cuts.append(
                {
                    "type": "filler_cut",
                    "start": float(f.get("start", 0)),
                    "end": float(f.get("end", 0)),
                    "words": f.get("words", []),
                }
            )

    return {
        "profile": profile,
        "preset": preset,
        "silenceCuts": silence_cuts,
        "fillerActions": filler_cuts,
        "totalSilenceSaved": round(sum(c["durationSaved"] for c in silence_cuts), 3),
    }
