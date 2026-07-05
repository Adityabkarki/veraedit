"""Speaker diarization signals — pyannote ML or pause-based heuristic fallback."""
from __future__ import annotations

from typing import Any

from tasks.transcript_enrich import assign_speakers_pause_based

_ML_CONFIDENCE = 0.88
_HEURISTIC_CONFIDENCE = 0.65


def extract_speaker_changes(
    words: list[dict],
    speakers_meta: list[dict] | None = None,
) -> list[dict]:
    """
    Return speaker-change segments from word-level transcript.

    Each segment: { start, end, confidence, speakerId, confidenceSource }
    """
    source = _diarization_source(words, speakers_meta)
    enriched = _enriched_words(words, speakers_meta, source)
    if not enriched:
        return []

    segments: list[dict] = []
    current_speaker = enriched[0].get("speaker", "A")
    seg_start = float(enriched[0].get("start", 0))
    prev_end = float(enriched[0].get("end", seg_start))
    confidence = _ML_CONFIDENCE if source == "ml" else _HEURISTIC_CONFIDENCE

    for w in enriched[1:]:
        speaker = w.get("speaker", current_speaker)
        start = float(w.get("start", prev_end))
        end = float(w.get("end", start))

        if speaker != current_speaker:
            segments.append(
                {
                    "start": seg_start,
                    "end": prev_end,
                    "confidence": confidence,
                    "speakerId": current_speaker,
                    "confidenceSource": source,
                }
            )
            current_speaker = speaker
            seg_start = start

        prev_end = end

    segments.append(
        {
            "start": seg_start,
            "end": prev_end,
            "confidence": confidence,
            "speakerId": current_speaker,
            "confidenceSource": source,
        }
    )
    return segments


def _diarization_source(words: list[dict], speakers_meta: list[dict] | None) -> str:
    if speakers_meta and any(s.get("diarizationSource") == "ml" for s in speakers_meta):
        return "ml"
    if any(str(w.get("speaker", "")).startswith("SPEAKER_") for w in words):
        return "ml"
    return "heuristic"


def _enriched_words(
    words: list[dict],
    speakers_meta: list[dict] | None,
    source: str,
) -> list[dict]:
    if any(w.get("speaker") for w in words):
        return words
    enriched, _ = assign_speakers_pause_based(words)
    if source == "heuristic" and speakers_meta is None:
        return enriched
    return enriched
