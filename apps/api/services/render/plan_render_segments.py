"""Long-form render segment planning (Phase 14)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

RENDER_SEGMENT_THRESHOLD_MINUTES = 10
DEFAULT_TARGET_SEGMENT_MINUTES = 4


@dataclass(frozen=True)
class RenderSegment:
    segment_index: int
    start_frame: int
    end_frame: int

    def to_dict(self) -> dict[str, int]:
        return {
            "segmentIndex": self.segment_index,
            "startFrame": self.start_frame,
            "endFrame": self.end_frame,
        }


def _transition_range(entry: dict[str, Any]) -> tuple[int, int]:
    at_frame = int(entry.get("atFrame", 0))
    duration = int(entry.get("durationInFrames", 0))
    return at_frame, at_frame + max(duration, 1)


def _clip_range(entry: dict[str, Any]) -> tuple[int, int]:
    start = int(entry.get("startFrame", 0))
    duration = int(entry.get("durationInFrames", 0))
    return start, start + max(duration, 1)


def _is_inside(frame: int, start: int, end: int) -> bool:
    return start < frame < end


def _is_forbidden_split(
    frame: int,
    transitions: list[dict[str, Any]],
    clips: list[dict[str, Any]],
) -> bool:
    for t in transitions:
        start, end = _transition_range(t)
        if _is_inside(frame, start, end):
            return True
    for c in clips:
        start, end = _clip_range(c)
        if _is_inside(frame, start, end):
            return True
    return False


def _safe_candidates(
    duration_in_frames: int,
    clips: list[dict[str, Any]],
    transitions: list[dict[str, Any]],
) -> list[int]:
    candidates = {0, duration_in_frames}
    for clip in sorted(clips, key=lambda c: int(c.get("startFrame", 0))):
        start, end = _clip_range(clip)
        candidates.add(start)
        candidates.add(end)
    for t in transitions:
        start, end = _transition_range(t)
        candidates.add(start)
        candidates.add(end)
    return sorted(
        f
        for f in candidates
        if 0 <= f <= duration_in_frames
        and not _is_forbidden_split(f, transitions, clips)
    )


def _snap_split(target: int, candidates: list[int], min_frame: int) -> int:
    best = candidates[-1] if candidates else target
    best_dist = float("inf")
    for c in candidates:
        if c <= min_frame:
            continue
        dist = abs(c - target)
        if dist < best_dist:
            best_dist = dist
            best = c
    return best


def plan_render_segments(
    timeline: dict[str, Any],
    *,
    target_segment_minutes: int = DEFAULT_TARGET_SEGMENT_MINUTES,
    threshold_minutes: int = RENDER_SEGMENT_THRESHOLD_MINUTES,
) -> list[RenderSegment]:
    """Plan transition-respecting render segments for a DirectorTimeline."""
    fps = int(timeline.get("fps") or 30)
    duration_in_frames = max(
        1,
        int(timeline.get("durationInFrames") or 0)
        or int(float(timeline.get("durationSeconds") or 0) * fps),
    )
    threshold_frames = threshold_minutes * 60 * fps

    if duration_in_frames <= threshold_frames:
        return [RenderSegment(0, 0, duration_in_frames - 1)]

    target_frames = target_segment_minutes * 60 * fps
    tracks = timeline.get("tracks") or {}
    clips = list(tracks.get("video") or [])
    transitions = list(tracks.get("transitions") or [])
    candidates = _safe_candidates(duration_in_frames, clips, transitions)

    split_points = [0]
    cursor = 0
    min_gap = fps * 30
    while cursor < duration_in_frames - 1:
        target = cursor + target_frames
        if target >= duration_in_frames - 1:
            break
        split = _snap_split(target, candidates, cursor + min_gap)
        if split <= cursor:
            break
        split_points.append(split)
        cursor = split

    if split_points[-1] != duration_in_frames:
        split_points.append(duration_in_frames)

    segments: list[RenderSegment] = []
    for i in range(len(split_points) - 1):
        start = split_points[i]
        end = split_points[i + 1] - 1
        if end >= start:
            segments.append(RenderSegment(i, start, end))

    return segments or [RenderSegment(0, 0, duration_in_frames - 1)]
