"""
Transcript enrichment — speaker diarization (heuristic), silence blocks, confidence.
"""
from __future__ import annotations

from typing import Any

SPEAKER_PAUSE_THRESHOLD = 1.2  # seconds — switch speaker A/B
SILENCE_BLOCK_MIN = 0.4


def assign_speakers_pause_based(words: list[dict]) -> tuple[list[dict], list[dict]]:
    """
    Alternate speakers A/B on long pauses (podcast heuristic when no pyannote).
    Returns (enriched_words, speakers_metadata).
    """
    if not words:
        return [], [{"id": "A", "label": "Speaker A"}, {"id": "B", "label": "Speaker B"}]

    current = "A"
    enriched: list[dict] = []
    prev_end = 0.0

    for w in words:
        start = float(w.get("start", 0))
        if start - prev_end >= SPEAKER_PAUSE_THRESHOLD and prev_end > 0:
            current = "B" if current == "A" else "A"
        item = dict(w)
        item["speaker"] = current
        enriched.append(item)
        prev_end = float(w.get("end", start))

    speakers = [
        {"id": "A", "label": "Speaker A", "color": "#3B82F6"},
        {"id": "B", "label": "Speaker B", "color": "#F97316"},
    ]
    return enriched, speakers


def attach_word_confidence(
    words: list[dict],
    segments: list[dict] | None = None,
) -> list[dict]:
    """Map segment avg_logprob to each word as confidence 0–1."""
    import math

    seg_conf: list[tuple[float, float, float]] = []
    for seg in segments or []:
        start = float(seg.get("start", 0))
        end = float(seg.get("end", start))
        logprob = float(seg.get("avg_logprob", -0.3))
        conf = max(0.0, min(1.0, math.exp(logprob)))
        seg_conf.append((start, end, conf))

    out: list[dict] = []
    for w in words:
        item = dict(w)
        ws = float(w.get("start", 0))
        conf = 0.85
        for ss, se, c in seg_conf:
            if ss <= ws < se:
                conf = c
                break
        item["confidence"] = round(conf, 3)
        item["type"] = "word"
        out.append(item)
    return out


def insert_silence_blocks(words: list[dict], min_gap: float = SILENCE_BLOCK_MIN) -> list[dict]:
    """Insert silence entries between words where gap >= min_gap."""
    if not words:
        return []

    sorted_w = sorted(words, key=lambda x: float(x.get("start", 0)))
    result: list[dict] = []
    prev_end = float(sorted_w[0].get("start", 0))

    for i, w in enumerate(sorted_w):
        start = float(w.get("start", 0))
        if start - prev_end >= min_gap:
            result.append({
                "word": f"[{round(start - prev_end, 1)}s silence]",
                "start": prev_end,
                "end": start,
                "type": "silence",
                "silence_duration": round(start - prev_end, 2),
                "speaker": w.get("speaker", "A"),
                "confidence": 1.0,
            })
        result.append(w)
        prev_end = max(prev_end, float(w.get("end", start)))

    return result


def enrich_transcript_for_storage(
    words: list[dict],
    segments: list[dict] | None = None,
    *,
    diarization_segments: list[dict] | None = None,
    diarization_source: str = "heuristic",
) -> tuple[list[dict], list[dict]]:
    """Full enrichment pipeline for DB persistence."""
    from tasks.nepali_postprocess import postprocess_transcript_words

    cleaned = postprocess_transcript_words(words)
    with_conf = attach_word_confidence(cleaned, segments)

    if diarization_segments:
        from services.diarization.pyannote_diarizer import assign_speakers_from_diarization

        with_speakers, speakers = assign_speakers_from_diarization(with_conf, diarization_segments)
    else:
        with_speakers, speakers = assign_speakers_pause_based(with_conf)
        for speaker in speakers:
            speaker["diarizationSource"] = diarization_source

    final = insert_silence_blocks(with_speakers)
    return final, speakers
