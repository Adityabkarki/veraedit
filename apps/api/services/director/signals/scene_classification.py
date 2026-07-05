"""Scene / shot classification — transcript-heuristic until CV pass is wired."""
from __future__ import annotations

_SCREEN_HINTS = (
    "on the screen",
    "in the app",
    "dashboard",
    "interface",
    "demo",
    "click",
    "button",
    "swipe",
)
_TALKING_HEAD_HINTS = (
    "welcome",
    "hello",
    "today",
    "episode",
    "podcast",
    "interview",
    "guest",
)


def classify_scene_segments(segments: list[dict]) -> list[dict]:
    """
    Lightweight scene typing per transcript segment.

    Returns { start, end, confidence, sceneType, label }.
    """
    results: list[dict] = []
    for seg in segments:
        text = str(seg.get("text", "")).lower()
        start = float(seg.get("start", 0))
        end = float(seg.get("end", start))
        scene_type = "unknown"
        confidence = 0.5

        if any(h in text for h in _SCREEN_HINTS):
            scene_type = "screen_recording"
            confidence = 0.72
        elif any(h in text for h in _TALKING_HEAD_HINTS):
            scene_type = "talking_head"
            confidence = 0.68

        results.append(
            {
                "start": start,
                "end": end,
                "confidence": confidence,
                "sceneType": scene_type,
                "label": str(seg.get("text", ""))[:40].strip() or None,
            }
        )
    return results
