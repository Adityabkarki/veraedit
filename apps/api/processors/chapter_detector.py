"""
ViraEdit — Chapter boundary detection (Phase 04).

Semantic GPT-4o-mini detection with rule-based pause fallback.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import structlog
from openai import AsyncOpenAI

from config import settings
from services.ai_budget import budget
from services.ai_costs import estimate_text_call_cost
from services.ai_fallback import call_with_local_fallback, ollama_json_completion
from tasks.llm_json_utils import extract_json

log = structlog.get_logger("viraedit.chapter_detector")


async def detect_chapters_semantic(
    transcript: dict[str, Any],
    min_chapter_duration: float = 60.0,
    *,
    project_id: str | None = None,
    job_id: str | None = None,
    workspace_id: str | None = None,
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

    estimated_cost = estimate_text_call_cost(prompt)
    budget.record(
        estimated_cost,
        action="chapter_detect",
        workspace_id=workspace_id or project_id,
        project_id=project_id,
        job_id=job_id,
        provider="openai",
        model=settings.OPENAI_MODEL_PRIMARY,
    )

    if budget.should_use_local():
        log.info("chapter_semantic_using_local_fallback")

        async def _primary() -> list[dict[str, Any]] | None:
            return None

        async def _fallback() -> list[dict[str, Any]] | None:
            return await _ollama_chapters(prompt)

        try:
            chapters = await call_with_local_fallback(
                _primary,
                _fallback,
                action_name="chapter detection",
            )
            return _validate_chapters(chapters, segments)
        except RuntimeError as exc:
            log.warning("chapter_local_fallback_failed", error=str(exc))
            return None

    if not settings.OPENAI_API_KEY:
        return None

    chapters = await _openai_chapters(prompt)
    return _validate_chapters(chapters, segments) if chapters is not None else None


async def _openai_chapters(prompt: str) -> list[dict[str, Any]] | None:
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
    return chapters


async def _ollama_chapters(prompt: str) -> list[dict[str, Any]] | None:
    chapters = await ollama_json_completion(prompt)
    if not isinstance(chapters, list):
        raise ValueError("Local model returned non-list JSON for chapters")
    return chapters


def _validate_chapters(
    chapters: list[dict[str, Any]] | None,
    segments: list[dict[str, Any]],
) -> list[dict[str, Any]] | None:
    if not chapters:
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
    *,
    project_id: str | None = None,
    job_id: str | None = None,
    workspace_id: str | None = None,
) -> list[dict[str, Any]]:
    """Try semantic detection first; fall back to rule-based on failure or budget cap."""
    try:
        result = await detect_chapters_semantic(
            transcript,
            min_chapter_duration,
            project_id=project_id,
            job_id=job_id,
            workspace_id=workspace_id,
        )
        if result:
            return result
    except Exception as exc:
        log.warning("chapter_semantic_failed", error=str(exc))

    return detect_chapters_fallback(transcript, min_chapter_duration)


async def detect_chapters_with_energy(
    video_path: str | Path,
    transcript: dict[str, Any],
    min_chapter_duration: float = 60.0,
    *,
    project_id: str | None = None,
    job_id: str | None = None,
    workspace_id: str | None = None,
) -> list[dict[str, Any]]:
    """
    Semantic chapter detection plus audio energy spikes as notable_moments
    within chapters (does not over-fragment long-form content).
    """
    from processors.audio_energy import extract_energy_profile, find_energy_spikes

    semantic_chapters = await detect_chapters(
        transcript,
        min_chapter_duration,
        project_id=project_id,
        job_id=job_id,
        workspace_id=workspace_id,
    )

    try:
        energy_profile = extract_energy_profile(video_path)
        spikes = find_energy_spikes(energy_profile, threshold=0.75, min_gap_seconds=5.0)
    except Exception as exc:
        log.warning("chapter_energy_analysis_failed", error=str(exc))
        return semantic_chapters

    existing_boundaries = [
        float(ch["start"]) for ch in semantic_chapters
    ] + [float(ch["end"]) for ch in semantic_chapters]

    for spike in spikes:
        near_existing = any(
            abs(spike["timestamp"] - boundary) < min_chapter_duration * 0.5
            for boundary in existing_boundaries
        )
        if near_existing:
            continue
        for ch in semantic_chapters:
            if float(ch["start"]) <= spike["timestamp"] <= float(ch["end"]):
                ch.setdefault("notable_moments", [])
                ch["notable_moments"].append(spike["timestamp"])
                break

    return semantic_chapters
