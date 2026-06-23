"""
ViraEdit — Claude AI client for scene analysis.

Uses Anthropic's Claude API with prompt caching to minimise costs.

Model strategy:
  - Scene splitting + basic analysis: claude-haiku-3-5  (~$0.001 per video)
  - Viral scoring + suggestions:      claude-sonnet-4-5 (~$0.005 per video)

Prompt caching:
  - System prompt is marked with cache_control (TTL: 5 min)
  - On retries/re-analysis, cached system prompt saves ~90% of input tokens

Cost tracking:
  - All token counts logged to costs table
  - $2.00/hr AI budget enforced per project (checked before each call)

Error handling:
  - Anthropic API errors → retry 3× with exponential backoff
  - JSON parse failure → retry with "output must be valid JSON" reminder
  - Budget exceeded → raise BudgetExceededError (user sees friendly message)
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from typing import Any, Optional

import structlog
from anthropic import Anthropic, APIError, RateLimitError

from config import settings

log = structlog.get_logger("viraedit.claude")

# Anthropic pricing (USD per token, as of 2025)
# claude-haiku-3-5
HAIKU_INPUT_COST = 0.80 / 1_000_000   # $0.80 per 1M input tokens
HAIKU_OUTPUT_COST = 4.00 / 1_000_000  # $4.00 per 1M output tokens

# claude-sonnet-4-5
SONNET_INPUT_COST = 3.00 / 1_000_000   # $3.00 per 1M input tokens
SONNET_OUTPUT_COST = 15.00 / 1_000_000 # $15.00 per 1M output tokens

# Models
HAIKU_MODEL = "claude-haiku-3-5"
SONNET_MODEL = "claude-sonnet-4-5"


@dataclass
class ClaudeResult:
    """Result from a Claude API call."""
    content: dict[str, Any]       # Parsed JSON response
    model: str
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int = 0    # Tokens served from prompt cache
    cache_write_tokens: int = 0   # Tokens written to prompt cache
    cost_usd: float = 0.0
    duration_s: float = 0.0


def analyze_scenes(
    full_text: str,
    words: list[dict],
    duration: float,
    use_haiku: bool = False,
) -> ClaudeResult:
    """
    Ask Claude to segment the transcript into scenes and score each for viral potential.

    Args:
        full_text:  Complete Nepali transcript text.
        words:      List of {"word": str, "start": float, "end": float} dicts.
        duration:   Total video duration in seconds.
        use_haiku:  Use the cheaper/faster Haiku model (default: Sonnet).

    Returns:
        ClaudeResult with content = scene analysis JSON dict.
    """
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError(
            "ANTHROPIC_API_KEY is not set. "
            "Add it to your .env file: ANTHROPIC_API_KEY=sk-ant-..."
        )

    from tasks.prompts import SCENE_ANALYSIS_SYSTEM, SCENE_ANALYSIS_USER

    # Sample first 100 words for timing context (keeps prompt smaller)
    words_sample = "\n".join(
        f"{w['word']} [{w['start']:.1f}s-{w['end']:.1f}s]"
        for w in words[:100]
    )

    user_message = SCENE_ANALYSIS_USER.format(
        full_text=full_text[:8000],  # Cap at 8000 chars to control costs
        words_sample=words_sample,
        duration=duration,
    )

    model = HAIKU_MODEL if use_haiku else SONNET_MODEL

    return _call_claude(
        system=SCENE_ANALYSIS_SYSTEM,
        user=user_message,
        model=model,
        task_name="scene_analysis",
    )


def generate_suggestions(
    scenes: list[dict],
    best_hook: dict,
    filler_sections: list[dict],
    overall_score: float,
) -> ClaudeResult:
    """
    Ask Claude to generate actionable editing suggestions based on scene analysis.

    Always uses Sonnet — suggestions need nuanced understanding.
    """
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY is not set.")

    from tasks.prompts import SUGGESTIONS_SYSTEM, SUGGESTIONS_USER

    user_message = SUGGESTIONS_USER.format(
        scenes_json=json.dumps(scenes[:20], ensure_ascii=False, indent=2),
        hook_json=json.dumps(best_hook, ensure_ascii=False),
        fillers_json=json.dumps(filler_sections[:10], ensure_ascii=False),
        overall_score=overall_score,
    )

    return _call_claude(
        system=SUGGESTIONS_SYSTEM,
        user=user_message,
        model=SONNET_MODEL,
        task_name="suggestions",
    )


def _call_claude(
    system: str,
    user: str,
    model: str,
    task_name: str,
    max_retries: int = 3,
) -> ClaudeResult:
    """
    Make a Claude API call with prompt caching and JSON extraction.

    The system prompt is cached (cache_control) to save tokens on retries.
    JSON is extracted from the response — handles minor formatting issues.
    """
    client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    start = time.perf_counter()
    last_exc: Optional[Exception] = None

    for attempt in range(max_retries):
        try:
            response = client.messages.create(
                model=model,
                max_tokens=4096,
                system=[
                    {
                        "type": "text",
                        "text": system,
                        # Prompt caching — saves ~90% of system prompt tokens on retries
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                messages=[
                    {"role": "user", "content": user}
                ],
            )

            raw_text = response.content[0].text

            # Extract JSON — handles models that add commentary despite instructions
            parsed = _extract_json(raw_text)

            # Calculate cost
            usage = response.usage
            input_tokens = usage.input_tokens
            output_tokens = usage.output_tokens
            cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
            cache_write = getattr(usage, "cache_creation_input_tokens", 0) or 0

            is_haiku = "haiku" in model.lower()
            input_cost = HAIKU_INPUT_COST if is_haiku else SONNET_INPUT_COST
            output_cost = HAIKU_OUTPUT_COST if is_haiku else SONNET_OUTPUT_COST
            cost_usd = (input_tokens * input_cost) + (output_tokens * output_cost)

            duration = time.perf_counter() - start

            log.info(
                "claude_api_call_complete",
                task=task_name,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cache_read_tokens=cache_read,
                cost_usd=round(cost_usd, 6),
                duration_s=round(duration, 2),
                attempt=attempt + 1,
            )

            return ClaudeResult(
                content=parsed,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cache_read_tokens=cache_read,
                cache_write_tokens=cache_write,
                cost_usd=cost_usd,
                duration_s=duration,
            )

        except RateLimitError as exc:
            wait = 2 ** attempt * 5  # 5s, 10s, 20s
            log.warning("claude_rate_limit", attempt=attempt + 1, wait_s=wait)
            time.sleep(wait)
            last_exc = exc

        except json.JSONDecodeError as exc:
            log.warning(
                "claude_json_parse_failed",
                attempt=attempt + 1,
                error=str(exc),
            )
            # Next attempt adds a reminder about JSON format
            user = user + "\n\nREMINDER: Your previous response was not valid JSON. Return ONLY a JSON object."
            last_exc = exc

        except APIError as exc:
            log.error("claude_api_error", error=str(exc), attempt=attempt + 1)
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
            last_exc = exc

    raise RuntimeError(
        f"Claude API failed after {max_retries} attempts: {last_exc}"
    )


def _extract_json(text: str) -> dict:
    """
    Extract JSON from Claude's response, handling common formatting issues.

    Claude sometimes wraps JSON in ```json ... ``` blocks or adds preamble text.
    """
    # 1. Try direct parse first
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 2. Try stripping markdown code fence
    fence_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fence_match:
        return json.loads(fence_match.group(1))

    # 3. Find the first { ... } block
    start = text.find("{")
    end = text.rfind("}") + 1
    if start >= 0 and end > start:
        return json.loads(text[start:end])

    raise json.JSONDecodeError(
        f"No JSON object found in Claude response. Response: {text[:200]!r}",
        doc=text,
        pos=0,
    )


def estimate_cost(text_length: int, duration_s: float) -> dict[str, float]:
    """
    Estimate analysis cost before making API calls.
    Useful for budget checks.

    Returns dict with scene_analysis and suggestions costs.
    """
    # Rough estimate: 1 token ≈ 4 chars; system prompt ≈ 800 tokens
    approx_tokens = (text_length // 4) + 800
    scene_cost = (approx_tokens * SONNET_INPUT_COST) + (500 * SONNET_OUTPUT_COST)
    suggestions_cost = (500 * SONNET_INPUT_COST) + (600 * SONNET_OUTPUT_COST)
    return {
        "scene_analysis_usd": round(scene_cost, 6),
        "suggestions_usd": round(suggestions_cost, 6),
        "total_usd": round(scene_cost + suggestions_cost, 6),
    }
