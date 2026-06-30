"""
ViraEdit — Sizzle reel fragment detection (Phase 05).

Finds many short, high-energy micro-moments for trailer-style montages.
Distinct from find_viral_moments (fewer, longer standalone clips).
"""
from __future__ import annotations

import re
from typing import Any

import structlog
from openai import AsyncOpenAI

from config import settings
from services.ai_budget import budget
from tasks.llm_json_utils import extract_json

log = structlog.get_logger("viraedit.sizzle_finder")

_ENERGY_PATTERN = re.compile(r"[!?।]|हाहा|wow|amazing|incredible", re.IGNORECASE)


async def find_sizzle_moments(
    transcript: dict[str, Any],
    target_total_duration: float = 30.0,
    fragment_count: int = 10,
) -> list[dict[str, Any]]:
    """
    Find short fragments (1-4s each) spread across the whole video for montage cutting.
    Returns chronologically sorted fragments.
    """
    try:
        result = await _find_sizzle_semantic(transcript, target_total_duration, fragment_count)
        if result:
            return result
    except Exception as exc:
        log.warning("sizzle_semantic_failed", error=str(exc))

    return _find_sizzle_fallback(transcript, target_total_duration, fragment_count)


async def _find_sizzle_semantic(
    transcript: dict[str, Any],
    target_total_duration: float,
    fragment_count: int,
) -> list[dict[str, Any]] | None:
    segments = transcript.get("segments") or []
    if not segments:
        return []

    segments_text = "\n".join(
        f"[{float(seg.get('start', 0)):.1f}s-{float(seg.get('end', 0)):.1f}s] {seg.get('text', '')}"
        for seg in segments
    )
    avg_fragment_duration = target_total_duration / max(fragment_count, 1)

    prompt = f"""You are cutting a TRAILER/SIZZLE REEL — a fast-paced highlight montage
that previews the most exciting, surprising, funny, or compelling moments from this
entire video, spread across its full length (not just one section).

Find {fragment_count} short fragments, each roughly {avg_fragment_duration:.1f} seconds,
that would work as rapid-fire trailer cuts. Prioritize:
- Punchy, quotable one-liners
- Moments of laughter, surprise, or strong emotion
- Bold claims or hooks
- Visually/verbally distinct moments spread THROUGHOUT the video, not clustered together

Return ONLY valid JSON array, no markdown:
[
  {{
    "start": 12.4,
    "end": 15.1,
    "energy_score": 88,
    "reason": "Punchy quotable statement"
  }}
]

Transcript:
{segments_text[:8000]}"""

    estimated_cost = (len(prompt) / 4 / 1000) * 0.00015
    budget.record(estimated_cost, task="sizzle_detection")

    if budget.should_use_local() or not settings.OPENAI_API_KEY:
        return None

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    resp = await client.chat.completions.create(
        model=settings.OPENAI_MODEL_PRIMARY,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
        max_tokens=1200,
    )
    raw = (resp.choices[0].message.content or "").strip()
    fragments = extract_json(raw)
    if not isinstance(fragments, list):
        return None

    max_time = float(segments[-1].get("end", 0))
    valid = [
        f for f in fragments
        if isinstance(f, dict)
        and float(f.get("end", 0)) <= max_time + 1
        and float(f.get("end", 0)) > float(f.get("start", 0))
    ]
    return sorted(valid, key=lambda x: float(x["start"]))


def _find_sizzle_fallback(
    transcript: dict[str, Any],
    target_total_duration: float,
    fragment_count: int,
) -> list[dict[str, Any]]:
    """Rule-based fallback: score segments and pick spread-out short fragments."""
    segments = transcript.get("segments") or []
    if not segments:
        return []

    total_duration = float(segments[-1].get("end", 0)) or target_total_duration
    avg_len = max(1.5, min(4.0, target_total_duration / max(fragment_count, 1)))

    scored: list[tuple[float, dict[str, Any]]] = []
    for seg in segments:
        start = float(seg.get("start", 0))
        end = float(seg.get("end", start + 1))
        text = str(seg.get("text", "")).strip()
        if not text:
            continue
        energy = _segment_energy(text, end - start)
        frag_end = min(end, start + avg_len)
        scored.append((energy, {
            "start": start,
            "end": frag_end,
            "energy_score": int(energy * 100),
            "reason": "High-energy moment",
        }))

    scored.sort(key=lambda x: x[0], reverse=True)

    # Pick top fragments spread across the timeline (not clustered)
    bucket_count = max(fragment_count, 1)
    bucket_size = total_duration / bucket_count
    chosen: list[dict[str, Any]] = []
    used_buckets: set[int] = set()

    for _score, frag in scored:
        if len(chosen) >= fragment_count:
            break
        bucket = int(float(frag["start"]) / bucket_size) if bucket_size > 0 else 0
        bucket = min(bucket, bucket_count - 1)
        if bucket in used_buckets:
            continue
        used_buckets.add(bucket)
        chosen.append(frag)

    if len(chosen) < max(3, fragment_count // 2):
        for _score, frag in scored:
            if len(chosen) >= fragment_count:
                break
            if frag not in chosen:
                chosen.append(frag)

    return sorted(chosen[:fragment_count], key=lambda x: float(x["start"]))


def _segment_energy(text: str, duration: float) -> float:
    score = 0.3
    if _ENERGY_PATTERN.search(text):
        score += 0.35
    if len(text.split()) <= 12:
        score += 0.15
    if duration <= 4.0:
        score += 0.1
    return min(score, 1.0)
