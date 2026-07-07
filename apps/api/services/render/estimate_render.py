"""Pre-export render time and cost estimation (Phase 14)."""
from __future__ import annotations

from typing import Any

from services.render.plan_render_segments import plan_render_segments

DEFAULT_SECONDS_PER_OUTPUT_MINUTE = 45.0
PARALLEL_SEGMENT_SPEEDUP = 0.65


def estimate_render(
    timeline: dict[str, Any],
    *,
    seconds_per_output_minute: float | None = None,
    usd_per_render_minute: float = 0.0,
) -> dict[str, Any]:
    """Estimate wall-clock time and optional infra cost before export."""
    fps = int(timeline.get("fps") or 30)
    duration_in_frames = int(timeline.get("durationInFrames") or 0)
    duration_seconds = (
        duration_in_frames / fps if duration_in_frames else float(timeline.get("durationSeconds") or 0)
    )
    duration_minutes = duration_seconds / 60.0 if duration_seconds else 0.0

    tracks = timeline.get("tracks") or {}
    layers = (
        len(tracks.get("motionGraphics") or [])
        + len(tracks.get("vfx") or [])
        + len(tracks.get("broll") or [])
        + len(tracks.get("captions") or [])
    )
    complexity = 1.0 + layers / 80.0
    segments = plan_render_segments(timeline)
    base = seconds_per_output_minute or DEFAULT_SECONDS_PER_OUTPUT_MINUTE

    wall_clock = duration_minutes * base * complexity
    if len(segments) > 1:
        wall_clock = (wall_clock / len(segments)) * PARALLEL_SEGMENT_SPEEDUP * len(segments)

    cost_usd = (wall_clock / 60.0) * usd_per_render_minute

    return {
        "durationSeconds": round(duration_seconds, 2),
        "segmentCount": len(segments),
        "estimatedWallClockSeconds": int(round(wall_clock)),
        "estimatedCostUsd": round(cost_usd, 4),
        "complexityScore": round(complexity, 2),
        "methodology": (
            "duration × complexity × parallel_segment_factor"
            if len(segments) > 1
            else "duration × complexity (single segment)"
        ),
        "segments": [s.to_dict() for s in segments],
    }
