"""Feature and product mention detection."""
from __future__ import annotations

_FEATURE_PHRASES = (
    "as you can see",
    "this button",
    "swipe to",
    "click here",
    "tap on",
    "right here",
    "on the screen",
    "in the app",
    "this feature",
)


def extract_feature_mentions(segments: list[dict]) -> list[dict]:
    """Return { start, end, confidence, text } for product callout phrases."""
    results: list[dict] = []
    for seg in segments:
        text = str(seg.get("text", "")).lower()
        start = float(seg.get("start", 0))
        end = float(seg.get("end", start))
        for phrase in _FEATURE_PHRASES:
            if phrase in text:
                results.append(
                    {
                        "start": start,
                        "end": end,
                        "confidence": 0.78,
                        "text": str(seg.get("text", "")).strip(),
                    }
                )
                break
    return results
