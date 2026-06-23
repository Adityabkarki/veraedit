"""
ViraEdit — pipeline cost estimates and regeneration confirmation phrases.
"""
from __future__ import annotations

from config import settings

CONFIRM_TRANSCRIPTION = "Regenerate"
CONFIRM_CHAPTERS = "regenerate chapters"
CONFIRM_SHORTS = "regenerate shorts"
CONFIRM_SCOPED_REGENERATE = "regenerate"


def normalize_confirmation(text: str) -> str:
    return " ".join((text or "").strip().lower().split())


def confirmation_matches(provided: str, expected: str) -> bool:
    return normalize_confirmation(provided) == normalize_confirmation(expected)


def estimate_stt_cost_usd(duration_seconds: float) -> float:
    """ElevenLabs Scribe — billed by audio duration."""
    rate = settings.ELEVENLABS_STT_COST_PER_HOUR_USD / 3600.0
    return round(max(0.0, duration_seconds) * rate, 4)


def estimate_remaining_stt_cost_usd(
    duration_seconds: float,
    completed_chunks: int,
    total_chunks: int,
) -> float:
    if total_chunks <= 0:
        return estimate_stt_cost_usd(duration_seconds)
    remaining = max(0, total_chunks - completed_chunks)
    per_chunk = duration_seconds / total_chunks
    return round(estimate_stt_cost_usd(per_chunk * remaining), 4)


def estimate_chapters_analysis_cost_usd(duration_seconds: float) -> float:
    """
    OpenAI gpt-4o-mini — scene/chapter segmentation + editing suggestions.
    Rough heuristic: ~$0.01 base + $0.002 per minute of video.
    """
    minutes = max(duration_seconds / 60.0, 0.5)
    return round(min(0.20, 0.008 + minutes * 0.002), 4)


def estimate_shorts_regeneration_cost_usd() -> float:
    """Shorts extraction uses rules; LLM hook enrichment is a small add-on."""
    return 0.02


def estimate_scoped_regeneration_cost_usd(scope: str, duration_seconds: float) -> float:
    """Cost for POST /regenerate by scope."""
    scope_l = (scope or "").strip().lower()
    if scope_l == "shorts":
        return estimate_shorts_regeneration_cost_usd()
    if scope_l == "highlights":
        return round(0.01 + min(0.08, duration_seconds / 3600.0 * 0.05), 4)
    if scope_l in ("chapters", "master_edit", "suggestions"):
        return estimate_chapters_analysis_cost_usd(duration_seconds) * 0.35
    return 0.02
