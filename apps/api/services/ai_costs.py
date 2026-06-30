"""
ViraEdit — Centralized AI cost constants (Phase 07).

Update when provider pricing changes.
"""
from __future__ import annotations

COSTS = {
    "openai_gpt4o_mini_vision_call": 0.00015,
    "openai_gpt4o_mini_video_tag_call": 0.0003,
    "openai_gpt4o_mini_text_call_per_1k_tokens": 0.00015,
    "openai_dalle3_standard": 0.04,
    "openai_dalle3_hd": 0.08,
    "gemini_video_analysis_flat": 0.05,
    "gemini_image_generation": 0.04,
    "elevenlabs_scribe_per_minute": 0.0067,
}


def estimate_elevenlabs_cost(audio_duration_seconds: float) -> float:
    return (audio_duration_seconds / 60) * COSTS["elevenlabs_scribe_per_minute"]


def estimate_text_call_cost(prompt_text: str) -> float:
    estimated_tokens = len(prompt_text) / 4
    return (estimated_tokens / 1000) * COSTS["openai_gpt4o_mini_text_call_per_1k_tokens"]
