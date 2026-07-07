"""Windowed DirectorTimeline access and entry index sync (Phase 13)."""
from __future__ import annotations

from typing import Any

TRACK_KEYS = (
    "video",
    "audio",
    "captions",
    "broll",
    "motionGraphics",
    "transitions",
    "vfx",
    "sfx",
    "multicam",
)


def entry_frame_range(track_name: str, entry: dict[str, Any]) -> tuple[int, int]:
    """Return (startFrame, endFrame) for a track entry."""
    if track_name == "transitions":
        at_frame = int(entry.get("atFrame", 0))
        duration = int(entry.get("durationInFrames", 0))
        return at_frame, at_frame + max(duration, 1)

    start = int(entry.get("startFrame", 0))
    duration = int(entry.get("durationInFrames", 0))
    end_frame = int(entry.get("endFrame", 0))
    if end_frame > start:
        return start, end_frame
    return start, start + max(duration, 1)


def iter_timeline_entries(timeline: dict[str, Any]) -> list[tuple[str, dict[str, Any], int, int]]:
    """Flatten all track entries with frame ranges."""
    tracks = timeline.get("tracks") or {}
    rows: list[tuple[str, dict[str, Any], int, int]] = []
    for track_name in TRACK_KEYS:
        for entry in tracks.get(track_name) or []:
            if not isinstance(entry, dict):
                continue
            start, end = entry_frame_range(track_name, entry)
            entry_id = str(entry.get("id") or "")
            if not entry_id:
                continue
            rows.append((track_name, entry, start, end))
    return rows


def build_windowed_timeline(
    timeline: dict[str, Any],
    start_frame: int,
    end_frame: int,
) -> dict[str, Any]:
    """
    Return DirectorTimeline metadata plus track entries intersecting [start_frame, end_frame].
    """
    if start_frame > end_frame:
        start_frame, end_frame = end_frame, start_frame

    tracks = timeline.get("tracks") or {}
    windowed_tracks: dict[str, list[dict[str, Any]]] = {k: [] for k in TRACK_KEYS}

    for track_name in TRACK_KEYS:
        for entry in tracks.get(track_name) or []:
            if not isinstance(entry, dict):
                continue
            start, end = entry_frame_range(track_name, entry)
            if end >= start_frame and start <= end_frame:
                windowed_tracks[track_name].append(entry)

    fps = int(timeline.get("fps") or 30)
    windowed_triggers = [
        t
        for t in timeline.get("triggers") or []
        if _trigger_intersects_window(t, start_frame, end_frame, fps)
    ]

    return {
        "schemaVersion": timeline.get("schemaVersion"),
        "projectId": timeline.get("projectId"),
        "contentType": timeline.get("contentType"),
        "fps": fps,
        "durationInFrames": timeline.get("durationInFrames"),
        "width": timeline.get("width"),
        "height": timeline.get("height"),
        "theme": timeline.get("theme"),
        "pacingProfile": timeline.get("pacingProfile"),
        "tracks": windowed_tracks,
        "triggers": windowed_triggers,
        "window": {"startFrame": start_frame, "endFrame": end_frame},
    }


def _trigger_intersects_window(
    trigger: dict[str, Any],
    start_frame: int,
    end_frame: int,
    fps: int,
) -> bool:
    t_start = int(float(trigger.get("transcriptStart", 0)) * fps)
    t_end = int(float(trigger.get("transcriptEnd", 0)) * fps)
    return t_end >= start_frame and t_start <= end_frame


def paginate_triggers(
    timeline: dict[str, Any],
    *,
    cursor: int = 0,
    limit: int = 50,
    status: str | None = None,
) -> dict[str, Any]:
    """Paginate TriggerLogEntry list for long projects."""
    triggers = list(timeline.get("triggers") or [])
    if status:
        triggers = [t for t in triggers if t.get("status") == status]

    triggers.sort(key=lambda t: float(t.get("transcriptStart", 0)))
    total = len(triggers)
    page = triggers[cursor : cursor + limit]
    next_cursor = cursor + len(page) if cursor + len(page) < total else None

    return {
        "triggers": page,
        "total": total,
        "cursor": cursor,
        "limit": limit,
        "nextCursor": next_cursor,
        "hasMore": next_cursor is not None,
    }
