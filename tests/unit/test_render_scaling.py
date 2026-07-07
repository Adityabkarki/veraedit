"""Tests for Phase 14 long-form render scaling."""
from __future__ import annotations

from services.render.estimate_render import estimate_render
from services.render.plan_render_segments import (
    RENDER_SEGMENT_THRESHOLD_MINUTES,
    plan_render_segments,
)


def _long_timeline(duration_minutes: int, fps: int = 30) -> dict:
    duration_frames = duration_minutes * 60 * fps
    clip_len = 5 * 60 * fps
    clips = []
    transitions = []
    t = 0
    idx = 0
    while t < duration_frames:
        end = min(t + clip_len, duration_frames)
        clips.append(
            {
                "id": f"v{idx}",
                "startFrame": t,
                "durationInFrames": end - t,
            }
        )
        if idx > 0 and t < duration_frames:
            transitions.append(
                {
                    "id": f"tr{idx}",
                    "atFrame": t,
                    "durationInFrames": fps,
                }
            )
        t = end
        idx += 1

    return {
        "fps": fps,
        "durationInFrames": duration_frames,
        "tracks": {"video": clips, "transitions": transitions},
    }


def test_single_segment_below_threshold():
    tl = _long_timeline(RENDER_SEGMENT_THRESHOLD_MINUTES - 1)
    segments = plan_render_segments(tl)
    assert len(segments) == 1
    assert segments[0].start_frame == 0
    assert segments[0].end_frame == tl["durationInFrames"] - 1


def test_multi_segment_90_minute():
    tl = _long_timeline(90)
    segments = plan_render_segments(tl)
    assert len(segments) >= 10
    assert segments[0].start_frame == 0
    assert segments[-1].end_frame == tl["durationInFrames"] - 1
    for seg in segments:
        assert seg.end_frame >= seg.start_frame


def test_segments_avoid_transition_interiors():
    tl = _long_timeline(90)
    segments = plan_render_segments(tl)
    transitions = tl["tracks"]["transitions"]
    for seg in segments[1:]:
        split = seg.start_frame
        for tr in transitions:
            at_frame = tr["atFrame"]
            dur = tr["durationInFrames"]
            mid = at_frame + dur // 2
            assert not (at_frame < split < at_frame + dur), f"split {split} inside transition"


def test_estimate_render_long_form():
    tl = _long_timeline(60)
    tl["tracks"]["motionGraphics"] = [{"id": f"mg{i}"} for i in range(40)]
    est = estimate_render(tl)
    assert est["segmentCount"] >= 5
    assert est["estimatedWallClockSeconds"] > 60
    assert est["complexityScore"] > 1.0


def test_estimate_single_segment_short():
    tl = _long_timeline(5)
    est = estimate_render(tl)
    assert est["segmentCount"] == 1
