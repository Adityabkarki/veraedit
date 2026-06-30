"""
ViraEdit — Chapter boundary detection (Phase 04).

Semantic GPT-4o-mini detection with rule-based pause fallback.
"""
from __future__ import annotations

from typing import Any

import structlog
from openai import AsyncOpenAI

from config import settings
from services.ai_budget import budget
from tasks.llm_json_utils import extract_json

log = structlog.get_logger("viraedit.chapter_detector")


async def detect_chapters_semantic(
    transcript: dict[str, Any],
    min_chapter_duration: float = 60.0,
) -> list[dict[str, Any]] | None:
    """Primary chapter detection via GPT-4o-mini transcript analysis."""
    segments = transcript.get("segments") or []
    if not segments:
        return []

    segments_text = "\n".join(
        f"[{float(seg.get('start', 0)):.1f}s] {seg.get('text', '').strip()}"
        for seg in segments
    )

    prompt = f"""You are analyzing a podcast/recording transcript to split it into
logical CHAPTERS for separate publishing. Each chapter should be a coherent topic
or segment that makes sense as a standalone video, at least {min_chapter_duration:.0f}
seconds long.

Return ONLY valid JSON array, no markdown:
[
  {{
    "start": 0.0,
    "end": 245.3,
    "title": "Short descriptive chapter title (max 8 words)",
    "summary": "One sentence describing what's covered in this chapter"
  }}
]

Rules:
- Chapters must be sequential and non-overlapping, covering the entire transcript
- Merge short topic shifts into the surrounding chapter if they'd be under {min_chapter_duration:.0f}s
- Title should work as a standalone video title someone would click on

Transcript:
{segments_text[:10000]}"""

    estimated_cost = (len(prompt) / 4 / 1000) * 0.00015
    budget.record(estimated_cost, task="chapter_detection")

    if budget.should_use_local():
        log.info("chapter_semantic_skipped_budget")
        return None

    if not settings.OPENAI_API_KEY:
        return None

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    resp = await client.chat.completions.create(
        model=settings.OPENAI_MODEL_PRIMARY,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=1500,
    )
    raw = (resp.choices[0].message.content or "").strip()
    chapters = extract_json(raw)
    if not isinstance(chapters, list):
        return None

    max_time = float(segments[-1].get("end", 0))
    return [
        ch for ch in chapters
        if isinstance(ch, dict)
        and float(ch.get("end", 0)) <= max_time + 1
        and float(ch.get("end", 0)) > float(ch.get("start", 0))
    ]


def detect_chapters_fallback(
    transcript: dict[str, Any],
    min_chapter_duration: float = 60.0,
) -> list[dict[str, Any]]:
    """Rule-based fallback: pauses after sentence endings, merge short chapters."""
    segments = transcript.get("segments") or []
    if not segments:
        return []

    raw_chapters: list[dict[str, Any]] = []
    current_start = float(segments[0].get("start", 0))
    current_words: list[str] = []

    for i, seg in enumerate(segments):
        current_words.append(str(seg.get("text", "")))
        gap_to_next = (
            float(segments[i + 1].get("start", 0)) - float(seg.get("end", 0))
            if i < len(segments) - 1
            else 999.0
        )
        text = str(seg.get("text", "")).rstrip()
        is_sentence_end = text.endswith((".", "?", "!", "।"))

        if gap_to_next > 2.0 and is_sentence_end:
            raw_chapters.append({
                "start": current_start,
                "end": float(seg.get("end", 0)),
                "title": f"Part {len(raw_chapters) + 1}",
                "summary": " ".join(current_words)[:120],
            })
            current_start = (
                float(segments[i + 1].get("start", 0))
                if i < len(segments) - 1
                else float(seg.get("end", 0))
            )
            current_words = []

    if current_words and segments:
        raw_chapters.append({
            "start": current_start,
            "end": float(segments[-1].get("end", 0)),
            "title": f"Part {len(raw_chapters) + 1}",
            "summary": " ".join(current_words)[:120],
        })

    merged: list[dict[str, Any]] = []
    buffer: dict[str, Any] | None = None
    for ch in raw_chapters:
        if buffer is None:
            buffer = ch
        elif float(buffer["end"]) - float(buffer["start"]) < min_chapter_duration:
            buffer["end"] = ch["end"]
            buffer["summary"] = f"{buffer.get('summary', '')} {ch.get('summary', '')}".strip()[:200]
        else:
            merged.append(buffer)
            buffer = ch
    if buffer:
        merged.append(buffer)

    return merged


async def detect_chapters(
    transcript: dict[str, Any],
    min_chapter_duration: float = 60.0,
) -> list[dict[str, Any]]:
    """Try semantic detection first; fall back to rule-based on failure or budget cap."""
    try:
        result = await detect_chapters_semantic(transcript, min_chapter_duration)
        if result:
            return result
    except Exception as exc:
        log.warning("chapter_semantic_failed", error=str(exc))

    return detect_chapters_fallback(transcript, min_chapter_duration)
