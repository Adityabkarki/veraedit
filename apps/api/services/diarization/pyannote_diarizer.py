"""Pyannote-based speaker diarization with pause-heuristic fallback."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import structlog

from config import settings

log = structlog.get_logger("viraedit.diarization")

_PIPELINE = None


def _huggingface_token() -> str:
    return (settings.HUGGINGFACE_TOKEN or settings.HF_TOKEN or "").strip()


def diarize_audio_path(audio_path: Path) -> tuple[list[dict[str, Any]], str]:
    """
    Diarize an audio file.

    Returns:
        (segments, source) where each segment is
        {start, end, speaker} and source is 'ml' or 'heuristic'.
    """
    if not audio_path.exists():
        return [], "heuristic"

    if settings.DIARIZATION_ENABLED and _huggingface_token():
        try:
            segments = _run_pyannote(audio_path)
            if segments:
                log.info(
                    "diarization_ml_complete",
                    path=str(audio_path),
                    segments=len(segments),
                )
                return segments, "ml"
        except Exception as exc:
            log.warning("diarization_ml_failed", error=str(exc))

    return [], "heuristic"


def assign_speakers_from_diarization(
    words: list[dict],
    segments: list[dict[str, Any]],
) -> tuple[list[dict], list[dict]]:
    """Map word timestamps to diarization segments."""
    if not words or not segments:
        return [], []

    normalized = _normalize_speaker_labels(segments)
    enriched: list[dict] = []

    for w in words:
        mid = (float(w.get("start", 0)) + float(w.get("end", 0))) / 2.0
        speaker = _speaker_at_time(mid, normalized)
        item = dict(w)
        item["speaker"] = speaker
        enriched.append(item)

    speakers_meta = _speakers_metadata(normalized, source="ml")
    return enriched, speakers_meta


def _run_pyannote(audio_path: Path) -> list[dict[str, Any]]:
    global _PIPELINE
    from pyannote.audio import Pipeline

    if _PIPELINE is None:
        _PIPELINE = Pipeline.from_pretrained(
            settings.PYANNOTE_DIARIZATION_MODEL,
            use_auth_token=_huggingface_token(),
        )

    diarization = _PIPELINE(audio_path.as_posix())
    segments: list[dict[str, Any]] = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append(
            {
                "start": float(turn.start),
                "end": float(turn.end),
                "speaker": str(speaker),
            }
        )
    return segments


def _normalize_speaker_labels(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map pyannote labels (SPEAKER_00) to short ids (A, B, C…)."""
    mapping: dict[str, str] = {}
    out: list[dict[str, Any]] = []
    for seg in segments:
        raw = str(seg.get("speaker", "A"))
        if raw not in mapping:
            mapping[raw] = chr(ord("A") + len(mapping))
        out.append({**seg, "speaker": mapping[raw]})
    return out


def _speaker_at_time(t: float, segments: list[dict[str, Any]]) -> str:
    for seg in segments:
        if float(seg["start"]) <= t <= float(seg["end"]):
            return str(seg["speaker"])
    nearest = min(
        segments,
        key=lambda s: min(abs(t - float(s["start"])), abs(t - float(s["end"]))),
    )
    return str(nearest["speaker"])


def _speakers_metadata(segments: list[dict[str, Any]], *, source: str) -> list[dict]:
    seen: dict[str, float] = {}
    for seg in segments:
        sid = str(seg["speaker"])
        duration = float(seg["end"]) - float(seg["start"])
        seen[sid] = seen.get(sid, 0.0) + duration

    colors = ["#3B82F6", "#F97316", "#10B981", "#A855F7", "#EC4899"]
    meta: list[dict] = []
    for i, (sid, talk_time) in enumerate(sorted(seen.items())):
        meta.append(
            {
                "id": sid,
                "label": f"Speaker {sid}",
                "color": colors[i % len(colors)],
                "talk_time_s": round(talk_time, 2),
                "diarizationSource": source,
            }
        )
    return meta
