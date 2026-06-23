"""
Transcript quality scoring from Whisper word confidence and segment logprobs.
"""
from __future__ import annotations

import math
from typing import Any


def grade_from_avg_confidence(avg: float) -> str:
    """Map average word confidence to letter grade A–D."""
    if avg >= 0.88:
        return "A"
    if avg >= 0.78:
        return "B"
    if avg >= 0.65:
        return "C"
    return "D"


def compute_transcript_quality(
    words: list[dict[str, Any]],
    segments: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Build quality_metrics dict stored on the transcript row.

    Returns avg_confidence, low_confidence_count, quality_grade, word_count.
    """
    confidences: list[float] = []
    for w in words:
        if w.get("type") == "silence":
            continue
        c = w.get("confidence")
        if c is not None:
            confidences.append(float(c))

    if not confidences and segments:
        for seg in segments:
            logprob = float(seg.get("avg_logprob", -0.35))
            confidences.append(max(0.0, min(1.0, math.exp(logprob))))

    if not confidences:
        avg = 0.85
    else:
        avg = sum(confidences) / len(confidences)

    low_count = sum(1 for c in confidences if c < 0.7)
    word_count = sum(1 for w in words if w.get("type") != "silence")

    return {
        "avg_confidence": round(avg, 3),
        "low_confidence_count": low_count,
        "quality_grade": grade_from_avg_confidence(avg),
        "word_count": word_count,
        "needs_review": avg < 0.78 or low_count > max(3, word_count // 20),
    }
