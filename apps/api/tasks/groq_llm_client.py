"""
Deprecated — Groq is no longer used. Import from openai_llm_client instead.
"""
from __future__ import annotations

from tasks.llm_json_utils import extract_json as _extract_json
from tasks.openai_llm_client import (
    OPENAI_MODEL_FAST,
    OPENAI_MODEL_PRIMARY,
    OpenAILLMResult,
    _PRICING,
    _calculate_cost,
    call_openai_llm,
    estimate_cost,
)

# Legacy names for tests and old imports
GROQ_MODEL_70B = OPENAI_MODEL_PRIMARY
GROQ_MODEL_8B = OPENAI_MODEL_FAST
GroqLLMResult = OpenAILLMResult


def call_groq_llm(*args, **kwargs) -> OpenAILLMResult:
    return call_openai_llm(*args, **kwargs)
