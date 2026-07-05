"""NLP phrase spotting for comparisons and CTAs."""
from __future__ import annotations

_COMPARISON_PHRASES = (
    "compared to",
    "versus",
    " vs ",
    "against",
    "relative to",
)
_CTA_PHRASES = (
    "follow",
    "link in bio",
    "subscribe",
    "like and share",
    "comment below",
    "hit the bell",
)


def extract_comparisons(segments: list[dict]) -> list[dict]:
    results: list[dict] = []
    for seg in segments:
        text = str(seg.get("text", ""))
        lower = text.lower()
        start = float(seg.get("start", 0))
        end = float(seg.get("end", start))
        for phrase in _COMPARISON_PHRASES:
            if phrase in lower:
                results.append(
                    {
                        "start": start,
                        "end": end,
                        "confidence": 0.8,
                        "text": text.strip(),
                        "labels": ["Before", "After"],
                        "values": [40, 60],
                    }
                )
                break
    return results


def extract_cta_phrases(segments: list[dict]) -> list[dict]:
    results: list[dict] = []
    for seg in segments:
        text = str(seg.get("text", ""))
        lower = text.lower()
        start = float(seg.get("start", 0))
        end = float(seg.get("end", start))
        for phrase in _CTA_PHRASES:
            if phrase in lower:
                results.append(
                    {
                        "start": start,
                        "end": end,
                        "confidence": 0.85,
                        "text": text.strip(),
                    }
                )
                break
    return results
