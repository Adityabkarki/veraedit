"""Silence and pause detection from word-level transcript."""
from __future__ import annotations

from tasks.transcript_enrich import SILENCE_BLOCK_MIN, insert_silence_blocks


def extract_silences(words: list[dict], min_gap: float = SILENCE_BLOCK_MIN) -> list[dict]:
    """
    Return silence gaps between words.

    Each entry: { start, end, confidence }.
    """
    blocks = insert_silence_blocks(words, min_gap=min_gap)
    results: list[dict] = []
    for block in blocks:
        if block.get("type") != "silence":
            continue
        start = float(block.get("start", 0))
        end = float(block.get("end", start))
        duration = end - start
        confidence = min(0.95, 0.6 + duration)
        results.append(
            {
                "start": start,
                "end": end,
                "confidence": round(confidence, 3),
            }
        )
    return results


def extract_sustained_speech(
    speaker_segments: list[dict],
    *,
    min_duration: float = 3.0,
) -> list[dict]:
    """Long uninterrupted speech blocks for reactive equalizer rails."""
    results: list[dict] = []
    for seg in speaker_segments:
        start = float(seg.get("start", 0))
        end = float(seg.get("end", start))
        if end - start >= min_duration:
            results.append(
                {
                    "start": start,
                    "end": end,
                    "confidence": 0.8,
                }
            )
    return results
