"""Stat and number extraction from transcript text."""
from __future__ import annotations

import re

_NUMBER_RE = re.compile(
    r"(?<![\w.])(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)(%|k|K|m|M|b|B)?(?![\w.])"
)
_LABEL_BEFORE = re.compile(
    r"(\b(?:revenue|growth|profit|users|customers|sales|ROI|margin|rate|score)\b)",
    re.IGNORECASE,
)


def extract_stats(segments: list[dict]) -> list[dict]:
    """
    Find spoken numbers and percentages.

    Returns { start, end, confidence, rawText, value, label }.
    """
    results: list[dict] = []
    for seg in segments:
        text = str(seg.get("text", ""))
        start = float(seg.get("start", 0))
        end = float(seg.get("end", start))
        for match in _NUMBER_RE.finditer(text):
            raw = match.group(0)
            suffix = match.group(2) or ""
            value = f"{match.group(1)}{suffix}"
            label_match = _LABEL_BEFORE.search(text[: match.start()])
            label = label_match.group(1).title() if label_match else "Metric"
            confidence = 0.9 if suffix == "%" else 0.82
            results.append(
                {
                    "start": start,
                    "end": end,
                    "confidence": confidence,
                    "rawText": raw,
                    "value": value,
                    "label": label,
                }
            )
    return results
