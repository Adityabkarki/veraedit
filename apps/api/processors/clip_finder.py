"""
ViraEdit — Viral moment detection from transcript (Phase 03).

Finds the best short-form clip candidates from word-level timestamps.
"""
from __future__ import annotations

from typing import Any


async def find_viral_moments(
    transcript: dict[str, Any],
    *,
    max_clips: int = 5,
    target_duration: float = 60,
    content_type: str = "general",
) -> list[dict[str, Any]]:
    """
    Return ranked clip candidates: start, end, title, score, suggested_caption_style.
    """
    words = transcript.get("words") or []
    segments = transcript.get("segments") or []

    if not words and not segments:
        return []

    total_duration = _total_duration(transcript)
    min_dur = 15.0
    max_dur = max(min_dur, min(float(target_duration), 90.0))

    candidates: list[dict[str, Any]] = []

    if segments:
        for i in range(len(segments)):
            start = float(segments[i].get("start", 0))
            for j in range(i, len(segments)):
                end = float(segments[j].get("end", start))
                duration = end - start
                if duration < min_dur:
                    continue
                if duration > max_dur:
                    break
                text = " ".join(
                    str(segments[k].get("text", "")).strip()
                    for k in range(i, j + 1)
                ).strip()
                if not text:
                    continue
                score = _score_moment(start, end, total_duration, text, duration, content_type)
                candidates.append(_make_candidate(start, end, text, score))

    if len(candidates) < max_clips and words:
        step = 5.0
        t = 0.0
        while t < total_duration - min_dur:
            window_end = min(t + max_dur, total_duration)
            if window_end - t >= min_dur:
                clip_words = [
                    w for w in words
                    if float(w.get("start", 0)) >= t and float(w.get("end", 0)) <= window_end
                ]
                if clip_words:
                    text = " ".join(str(w.get("word", "")) for w in clip_words).strip()
                    score = _score_moment(t, window_end, total_duration, text, window_end - t, content_type)
                    candidates.append(_make_candidate(t, window_end, text, score))
            t += step

    candidates.sort(key=lambda c: c["score"], reverse=True)
    deduped = _deduplicate_candidates(candidates)
    return deduped[:max_clips]


def _total_duration(transcript: dict[str, Any]) -> float:
    words = transcript.get("words") or []
    segments = transcript.get("segments") or []
    if words:
        return float(words[-1].get("end", 0))
    if segments:
        return float(segments[-1].get("end", 0))
    return 60.0


def _score_moment(
    start: float,
    end: float,
    total: float,
    text: str,
    duration: float,
    content_type: str,
) -> float:
    score = 0.5
    word_count = len(text.split())
    wps = word_count / max(duration, 1)
    score += min(wps / 3.0, 0.25)

    if total > 0 and start / total < 0.25:
        score += 0.15

    ideal = 45.0 if content_type == "podcast" else 35.0
    score += max(0, 0.15 - abs(duration - ideal) / ideal * 0.15)

    if "?" in text or "!" in text:
        score += 0.05

    return round(min(score, 1.0), 3)


def _make_candidate(start: float, end: float, text: str, score: float) -> dict[str, Any]:
    title = text[:60].strip() or "Highlight clip"
    if len(text) > 60:
        title += "..."
    style = "nepali_bold" if any("\u0900" <= ch <= "\u097f" for ch in text) else "hormozi"
    return {
        "start": round(start, 3),
        "end": round(end, 3),
        "title": title,
        "score": score,
        "suggested_caption_style": style,
    }


def _deduplicate_candidates(candidates: list[dict[str, Any]], overlap: float = 0.5) -> list[dict[str, Any]]:
    kept: list[dict[str, Any]] = []
    for cand in candidates:
        if any(_overlaps(cand, other, overlap) for other in kept):
            continue
        kept.append(cand)
    return kept


def _overlaps(a: dict[str, Any], b: dict[str, Any], threshold: float) -> bool:
    overlap = min(a["end"], b["end"]) - max(a["start"], b["start"])
    if overlap <= 0:
        return False
    shorter = min(a["end"] - a["start"], b["end"] - b["start"])
    return shorter > 0 and overlap / shorter > threshold
