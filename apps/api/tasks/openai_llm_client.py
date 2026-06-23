"""
ViraEdit — OpenAI chat client for text analysis and AI editing.

Speech-to-text uses ElevenLabs Scribe in tasks/whisper.py — not this module.

Model: gpt-4o-mini only (scene analysis, suggestions, hooks, all editing).

Pricing (approximate, for budget tracking):
  gpt-4o-mini: $0.15 / 1M input,  $0.60 / 1M output
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import structlog
from openai import APIError, OpenAI, RateLimitError

from config import settings
from tasks.llm_json_utils import extract_json

log = structlog.get_logger("viraedit.openai_llm")

OPENAI_MODEL_PRIMARY = "gpt-4o-mini"
OPENAI_MODEL_FAST = "gpt-4o-mini"

_PRICING: dict[str, dict[str, float]] = {
    "gpt-4o-mini": {
        "input": 0.15 / 1_000_000,
        "output": 0.60 / 1_000_000,
    },
}


@dataclass
class OpenAILLMResult:
    content: dict[str, Any]
    raw_text: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    duration_s: float


def _calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    pricing = _PRICING.get(model, _PRICING[OPENAI_MODEL_PRIMARY])
    return input_tokens * pricing["input"] + output_tokens * pricing["output"]


def call_openai_llm(
    system: str,
    user: str,
    model: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.1,
    max_retries: int = 3,
) -> OpenAILLMResult:
    """Call OpenAI chat completions and return parsed JSON."""
    if not settings.OPENAI_API_KEY:
        raise ValueError(
            "OPENAI_API_KEY is not set. "
            "Add it to your .env file for AI analysis and editing."
        )

    model_name = model or settings.OPENAI_MODEL_PRIMARY
    if model_name != "gpt-4o-mini":
        model_name = "gpt-4o-mini"
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    last_error: Exception | None = None

    for attempt in range(max_retries):
        t0 = time.perf_counter()
        messages: list[dict[str, str]] = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        if attempt > 0 and last_error:
            messages.append({
                "role": "user",
                "content": (
                    "Your previous response could not be parsed as JSON. "
                    "Return ONLY a valid JSON object. No prose, no markdown."
                ),
            })

        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )
        except RateLimitError as exc:
            wait = min(2 ** attempt * 5, 30)
            log.warning(
                "openai_rate_limit",
                model=model_name,
                attempt=attempt + 1,
                retry_in=wait,
            )
            time.sleep(wait)
            last_error = exc
            continue
        except APIError as exc:
            log.error(
                "openai_api_error",
                model=model_name,
                attempt=attempt + 1,
                error=str(exc),
            )
            last_error = exc
            if attempt + 1 < max_retries:
                time.sleep(2 ** attempt)
            continue

        duration = time.perf_counter() - t0
        raw_text = response.choices[0].message.content or ""
        usage = response.usage
        input_tokens = usage.prompt_tokens if usage else 0
        output_tokens = usage.completion_tokens if usage else 0
        cost = _calculate_cost(model_name, input_tokens, output_tokens)

        try:
            parsed = extract_json(raw_text)
        except ValueError as exc:
            log.warning(
                "openai_json_parse_failure",
                model=model_name,
                attempt=attempt + 1,
                preview=raw_text[:200],
            )
            last_error = exc
            continue

        log.info(
            "openai_llm_success",
            model=model_name,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=round(cost, 6),
            duration_s=round(duration, 2),
        )
        return OpenAILLMResult(
            content=parsed,
            raw_text=raw_text,
            model=model_name,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost,
            duration_s=duration,
        )

    raise RuntimeError(
        f"OpenAI LLM call failed after {max_retries} attempts. "
        f"Last error: {last_error}"
    )


def estimate_cost(
    system: str,
    user: str,
    model: str | None = None,
    expected_output_tokens: int = 500,
) -> dict[str, float | int]:
    model_name = model or settings.OPENAI_MODEL_PRIMARY
    if model_name != "gpt-4o-mini":
        model_name = "gpt-4o-mini"
    input_tokens = max(1, len(system + user) // 4)
    pricing = _PRICING.get(model_name, _PRICING[OPENAI_MODEL_PRIMARY])
    total = (
        input_tokens * pricing["input"]
        + expected_output_tokens * pricing["output"]
    )
    return {
        "input_tokens": input_tokens,
        "output_tokens": expected_output_tokens,
        "total_usd": round(total, 6),
    }
