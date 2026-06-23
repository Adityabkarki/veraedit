"""
ViraEdit — Model Router & Cost Control.

Routes every AI task to the cheapest model that can do it,
enforces the $2.00/hr budget, and caches responses in Redis.

Budget tiers (per project, per video processing session):
  $0.00 – $2.00  → OpenAI gpt-4o-mini (all analysis / editing)
  $2.00+         → Block expensive calls

Special overrides:
  premium=True   → Claude Sonnet (user explicitly requested premium quality)
  task="caption" → Always rule-based (no LLM needed)

Speech-to-text is always ElevenLabs Scribe (tasks/whisper.py), not routed here.
"""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from typing import Any, Optional

import config as _config

log = logging.getLogger("viraedit.model_router")

BUDGET_LIMIT_USD: float = 2.00
TIER_DOWNGRADE_1: float = 1.60
TIER_DOWNGRADE_2: float = 1.80

OPENAI_PRIMARY = "openai/gpt-4o-mini"
OPENAI_FAST = "openai/gpt-4o-mini"
# Legacy aliases (tests / old code)
GROQ_70B = OPENAI_PRIMARY
GROQ_8B = OPENAI_FAST
CLAUDE_SONNET = "anthropic/claude-sonnet-4-5"
OLLAMA_LOCAL = "ollama/llama3.1:8b"

CACHE_TTL_SECONDS: int = 86_400
CACHE_KEY_PREFIX: str = "viraedit:ai:cache:"

TASK_MODEL_MAP: dict[str, str] = {
    "scene_analysis":    OPENAI_PRIMARY,
    "suggestions":       OPENAI_PRIMARY,
    "hook_rewrite":      OPENAI_PRIMARY,
    "shorts_scoring":    OPENAI_PRIMARY,
    "filler_detection":  OPENAI_FAST,
    "intent_classify":   OPENAI_FAST,
    "caption_gen":       OPENAI_FAST,
    "visual_planning":   OPENAI_PRIMARY,
    "prompt_command":    OPENAI_PRIMARY,
    "style_forensic":    OPENAI_PRIMARY,
}


@dataclass
class ModelSelection:
    model_id: str
    provider: str
    model_name: str
    tier: str
    is_premium: bool
    reason: str


@dataclass
class BudgetState:
    accumulated_usd: float = 0.0
    call_count: int = 0

    def add(self, cost_usd: float) -> None:
        self.accumulated_usd += cost_usd
        self.call_count += 1

    def remaining(self) -> float:
        return max(0.0, BUDGET_LIMIT_USD - self.accumulated_usd)

    def tier(self) -> str:
        if self.accumulated_usd < TIER_DOWNGRADE_1:
            return "primary"
        elif self.accumulated_usd < TIER_DOWNGRADE_2:
            return "fallback_8b"
        elif self.accumulated_usd < BUDGET_LIMIT_USD:
            return "local"
        else:
            return "blocked"


def _openai_selection(
    model_id: str,
    model_name: str,
    tier: str,
    reason: str,
) -> ModelSelection:
    return ModelSelection(
        model_id=model_id,
        provider="openai",
        model_name=model_name,
        tier=tier,
        is_premium=False,
        reason=reason,
    )


def select_model(
    task_type: str,
    budget: BudgetState,
    premium: bool = False,
) -> ModelSelection:
    if premium:
        if not _config.settings.ANTHROPIC_API_KEY:
            log.warning("premium_requested_but_no_anthropic_key")
        else:
            return ModelSelection(
                model_id=CLAUDE_SONNET,
                provider="anthropic",
                model_name="claude-sonnet-4-5",
                tier="premium",
                is_premium=True,
                reason="Premium mode requested by user",
            )

    current_tier = budget.tier()

    if current_tier == "blocked":
        log.error(
            "budget_exceeded: accumulated=%.4f limit=%.2f",
            budget.accumulated_usd,
            BUDGET_LIMIT_USD,
        )
        raise BudgetExceededError(
            f"AI budget exceeded (${budget.accumulated_usd:.2f} / ${BUDGET_LIMIT_USD:.2f}). "
            "Remaining tasks will use local processing only."
        )

    # All tiers use gpt-4o-mini (from settings); no Ollama for text analysis.
    model_name = _config.settings.OPENAI_MODEL_PRIMARY
    if model_name != "gpt-4o-mini":
        log.warning("openai_model_not_gpt_4o_mini", configured=model_name)

    tier_label = current_tier if current_tier in ("primary", "fallback_8b", "local") else "primary"
    return _openai_selection(
        OPENAI_PRIMARY,
        model_name,
        tier_label,
        f"Using gpt-4o-mini for {task_type} (budget ${budget.accumulated_usd:.2f})",
    )


def _cache_key(model_id: str, system: str, user: str) -> str:
    content = f"{model_id}:{system}:{user}"
    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()[:32]
    return f"{CACHE_KEY_PREFIX}{digest}"


def get_cached_response(
    model_id: str,
    system: str,
    user: str,
) -> Optional[dict[str, Any]]:
    try:
        import redis as redis_lib
        r = redis_lib.Redis.from_url(_config.settings.REDIS_URL, decode_responses=True)
        key = _cache_key(model_id, system, user)
        cached = r.get(key)
        if cached:
            log.debug("ai_cache_hit key=%s", key[:20])
            return json.loads(cached)
    except Exception as exc:
        log.warning("ai_cache_read_error: %s", exc)
    return None


def set_cached_response(
    model_id: str,
    system: str,
    user: str,
    response: dict[str, Any],
) -> None:
    try:
        import redis as redis_lib
        r = redis_lib.Redis.from_url(_config.settings.REDIS_URL, decode_responses=True)
        key = _cache_key(model_id, system, user)
        r.setex(key, CACHE_TTL_SECONDS, json.dumps(response, ensure_ascii=False))
        log.debug("ai_cache_set key=%s ttl=%d", key[:20], CACHE_TTL_SECONDS)
    except Exception as exc:
        log.warning("ai_cache_write_error: %s", exc)


def _ollama_available() -> bool:
    try:
        import urllib.request
        urllib.request.urlopen("http://localhost:11434/api/tags", timeout=1)
        return True
    except Exception:
        return False


class BudgetExceededError(Exception):
    pass


def budget_summary(budget: BudgetState) -> dict[str, Any]:
    return {
        "accumulated_usd": round(budget.accumulated_usd, 6),
        "remaining_usd": round(budget.remaining(), 6),
        "call_count": budget.call_count,
        "tier": budget.tier(),
        "limit_usd": BUDGET_LIMIT_USD,
        "pct_used": round(budget.accumulated_usd / BUDGET_LIMIT_USD * 100, 1),
    }
