"""
ViraEdit — Unified AI client.

This is the SINGLE entry point for all AI inference in ViraEdit.
Replaces direct use of claude_client.py or openai_llm_client.py.

Model routing:
  Default  → OpenAI gpt-4o-mini (scene analysis, suggestions, hooks)
  All tiers → OpenAI gpt-4o-mini until $2.00 budget limit
  Premium  → Claude Sonnet       (only if premium=True, user requested it)

Speech-to-text is ElevenLabs Scribe (tasks/whisper.py), not routed here.

Usage:
    from tasks.ai_client import call_ai, analyze_scenes, generate_suggestions

    # Generic call
    result = call_ai(
        system="You are...",
        user="Analyze this...",
        task_type="scene_analysis",
        budget=budget_state,
    )

    # Scene analysis (same interface as old claude_client.analyze_scenes)
    result = analyze_scenes(full_text, words, duration, budget=budget_state)

    # Suggestions (same interface as old claude_client.generate_suggestions)
    result = generate_suggestions(scenes, best_hook, filler_sections, score, budget=budget_state)
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Optional

import structlog

from tasks.model_router import (
    BudgetState,
    ModelSelection,
    get_cached_response,
    select_model,
    set_cached_response,
)

log = structlog.get_logger("viraedit.ai_client")


# ── Unified result dataclass ──────────────────────────────────────────────────

@dataclass
class AIResult:
    """
    Unified result from any AI provider.

    Replaces the old ClaudeResult — same fields, provider-agnostic.
    """
    content: dict[str, Any]        # Parsed JSON response
    raw_text: str                  # Raw model output
    model: str                     # Model used (e.g. "gpt-4o-mini")
    provider: str                  # Provider ("openai", "anthropic", "ollama", "cache")
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int = 0     # Claude prompt caching only
    cache_write_tokens: int = 0    # Claude prompt caching only
    cost_usd: float = 0.0
    duration_s: float = 0.0
    from_cache: bool = False


# ── Core call function ────────────────────────────────────────────────────────

def call_ai(
    system: str,
    user: str,
    task_type: str,
    budget: BudgetState,
    max_tokens: int = 4096,
    temperature: float = 0.1,
    premium: bool = False,
    use_cache: bool = True,
) -> AIResult:
    """
    Make an AI call, routing to the cheapest capable model.

    Args:
        system:     System prompt.
        user:       User prompt.
        task_type:  One of TASK_MODEL_MAP keys (e.g. "scene_analysis").
        budget:     Accumulated budget state for this processing session.
        max_tokens: Maximum output tokens.
        temperature: Sampling temperature.
        premium:    If True, use Claude Sonnet regardless of budget.
                    Only set when user explicitly requested premium quality.
        use_cache:  Check Redis cache before calling API (default: True).

    Returns:
        AIResult with parsed JSON content and cost info.
    """
    selection = select_model(task_type, budget, premium=premium)

    # Try cache first
    if use_cache:
        cached = get_cached_response(selection.model_id, system, user)
        if cached is not None:
            log.info(
                "ai_cache_hit",
                task=task_type,
                model=selection.model_id,
            )
            return AIResult(
                content=cached,
                raw_text="",
                model=selection.model_name,
                provider="cache",
                input_tokens=0,
                output_tokens=0,
                cost_usd=0.0,
                duration_s=0.0,
                from_cache=True,
            )

    log.info(
        "ai_call_start",
        task=task_type,
        model=selection.model_id,
        tier=selection.tier,
        budget_spent=round(budget.accumulated_usd, 4),
    )

    result = _dispatch(selection, system, user, max_tokens, temperature)

    # Update budget
    budget.add(result.cost_usd)

    # Cache the response
    if use_cache and not result.from_cache:
        set_cached_response(selection.model_id, system, user, result.content)

    log.info(
        "ai_call_complete",
        task=task_type,
        model=selection.model_id,
        cost_usd=round(result.cost_usd, 6),
        budget_total=round(budget.accumulated_usd, 4),
        duration_s=round(result.duration_s, 2),
    )

    return result


def _dispatch(
    selection: ModelSelection,
    system: str,
    user: str,
    max_tokens: int,
    temperature: float,
) -> AIResult:
    """Route to the correct provider implementation."""
    if selection.provider == "openai":
        return _call_openai(selection, system, user, max_tokens, temperature)
    elif selection.provider == "anthropic":
        return _call_claude(selection, system, user, max_tokens, temperature)
    elif selection.provider == "ollama":
        return _call_ollama(selection, system, user, max_tokens, temperature)
    else:
        raise ValueError(f"Unknown provider: {selection.provider!r}")


# ── OpenAI dispatch ───────────────────────────────────────────────────────────

def _call_openai(
    selection: ModelSelection,
    system: str,
    user: str,
    max_tokens: int,
    temperature: float,
) -> AIResult:
    from tasks.openai_llm_client import call_openai_llm

    result = call_openai_llm(
        system=system,
        user=user,
        model=selection.model_name,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    return AIResult(
        content=result.content,
        raw_text=result.raw_text,
        model=result.model,
        provider="openai",
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cost_usd=result.cost_usd,
        duration_s=result.duration_s,
    )


# ── Claude dispatch (premium only) ───────────────────────────────────────────

def _call_claude(
    selection: ModelSelection,
    system: str,
    user: str,
    max_tokens: int,
    temperature: float,
) -> AIResult:
    """
    Call Claude Sonnet via Anthropic API.
    Only invoked when premium=True (user explicitly requested it).
    Uses prompt caching to reduce costs on retries.
    """
    from tasks.claude_client import _call_claude as _claude_internal

    result = _claude_internal(
        system=system,
        user=user,
        model=selection.model_name,
        max_tokens=max_tokens,
    )
    return AIResult(
        content=result.content,
        raw_text="",  # claude_client doesn't expose raw_text
        model=result.model,
        provider="anthropic",
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cache_read_tokens=result.cache_read_tokens,
        cache_write_tokens=result.cache_write_tokens,
        cost_usd=result.cost_usd,
        duration_s=result.duration_s,
    )


# ── Ollama dispatch (local fallback) ─────────────────────────────────────────

def _call_ollama(
    selection: ModelSelection,
    system: str,
    user: str,
    max_tokens: int,
    temperature: float,
) -> AIResult:
    """
    Call local Ollama instance.
    Ollama serves OpenAI-compatible API at http://localhost:11434/v1
    """
    import json as _json
    import time
    import urllib.request

    t0 = time.perf_counter()
    payload = _json.dumps({
        "model": selection.model_name,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": False,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }).encode("utf-8")

    req = urllib.request.Request(
        "http://localhost:11434/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = _json.loads(resp.read())
    except Exception as exc:
        raise RuntimeError(f"Ollama call failed: {exc}") from exc

    duration = time.perf_counter() - t0
    raw = data.get("message", {}).get("content", "")

    from tasks.llm_json_utils import extract_json
    try:
        parsed = extract_json(raw)
    except ValueError as exc:
        raise ValueError(f"Ollama returned non-JSON: {raw[:300]!r}") from exc

    return AIResult(
        content=parsed,
        raw_text=raw,
        model=selection.model_name,
        provider="ollama",
        input_tokens=data.get("prompt_eval_count", 0),
        output_tokens=data.get("eval_count", 0),
        cost_usd=0.0,   # Ollama is free (local)
        duration_s=duration,
    )


# ── High-level task functions (drop-in for claude_client) ─────────────────────

def analyze_scenes(
    full_text: str,
    words: list[dict],
    duration: float,
    budget: BudgetState,
    premium: bool = False,
) -> AIResult:
    """
    Analyze Nepali video transcript — detect scenes, viral scores, hooks, fillers.

    This is the drop-in replacement for claude_client.analyze_scenes().
    Default model: OpenAI gpt-4o-mini.
    Premium model: Claude Sonnet (user must explicitly opt in).
    """
    from tasks.prompts import SCENE_ANALYSIS_SYSTEM, SCENE_ANALYSIS_USER

    words_sample = words[:100] if words else []
    user_prompt = SCENE_ANALYSIS_USER.format(
        full_text=full_text[:8000],
        words_sample=str(words_sample)[:1000],
        duration=duration,
    )

    return call_ai(
        system=SCENE_ANALYSIS_SYSTEM,
        user=user_prompt,
        task_type="scene_analysis",
        budget=budget,
        max_tokens=4096,
        temperature=0.1,
        premium=premium,
    )


def generate_suggestions(
    scenes: list[dict],
    best_hook: dict,
    filler_sections: list[dict],
    overall_score: float,
    budget: BudgetState,
    premium: bool = False,
) -> AIResult:
    """
    Generate editing suggestions from scene analysis results.

    Drop-in replacement for claude_client.generate_suggestions().
    Default model: OpenAI gpt-4o-mini.
    """
    import json as _json
    from tasks.prompts import SUGGESTIONS_SYSTEM, SUGGESTIONS_USER

    user_prompt = SUGGESTIONS_USER.format(
        scenes_json=_json.dumps(scenes[:20], ensure_ascii=False)[:3000],
        hook_json=_json.dumps(best_hook, ensure_ascii=False),
        fillers_json=_json.dumps(filler_sections[:10], ensure_ascii=False),
        overall_score=round(overall_score, 1),
    )

    return call_ai(
        system=SUGGESTIONS_SYSTEM,
        user=user_prompt,
        task_type="suggestions",
        budget=budget,
        max_tokens=3000,
        temperature=0.2,
        premium=premium,
    )


def generate_hooks_ai(
    topic: str,
    current_opening: str,
    best_moment_description: str,
    duration: float,
    budget: BudgetState,
    premium: bool = False,
) -> AIResult:
    """
    Generate 5 Nepali hook alternatives.

    Returns both Nepali text AND English rationale for each hook.
    Default: OpenAI gpt-4o-mini. Premium: Claude Sonnet.
    """
    from tasks.hooks import _HOOK_SYSTEM, _HOOK_USER

    user_prompt = _HOOK_USER.format(
        topic=topic[:500],
        current_opening=current_opening[:800],
        best_moment=best_moment_description[:400],
        duration=duration,
    )

    return call_ai(
        system=_HOOK_SYSTEM,
        user=user_prompt,
        task_type="hook_rewrite",
        budget=budget,
        max_tokens=1500,
        temperature=0.3,   # slightly higher for creative variation
        premium=premium,
    )


def plan_chapters(
    chapters: list[dict],
    duration: float,
    budget: BudgetState,
    premium: bool = False,
) -> AIResult:
    """Refine chapter titles and summaries (Sonnet-quality task)."""
    import json as _json
    from tasks.prompts import CHAPTER_PLAN_SYSTEM, CHAPTER_PLAN_USER

    user_prompt = CHAPTER_PLAN_USER.format(
        chapters_json=_json.dumps(chapters[:12], ensure_ascii=False)[:4000],
        duration=duration,
    )
    return call_ai(
        system=CHAPTER_PLAN_SYSTEM,
        user=user_prompt,
        task_type="chapter_plan",
        budget=budget,
        max_tokens=2000,
        temperature=0.2,
        premium=premium,
    )


def plan_master_edit(
    micro_scenes: list[dict],
    best_hook: dict,
    filler_sections: list[dict],
    content_type: str,
    duration: float,
    budget: BudgetState,
    premium: bool = False,
) -> AIResult:
    """Pro podcast master edit suggestions."""
    import json as _json
    from tasks.prompts import MASTER_EDIT_SYSTEM, MASTER_EDIT_USER

    user_prompt = MASTER_EDIT_USER.format(
        content_type=content_type,
        duration=duration,
        scenes_json=_json.dumps(micro_scenes[:25], ensure_ascii=False)[:3500],
        hook_json=_json.dumps(best_hook, ensure_ascii=False),
        fillers_json=_json.dumps(filler_sections[:12], ensure_ascii=False),
    )
    return call_ai(
        system=MASTER_EDIT_SYSTEM,
        user=user_prompt,
        task_type="master_edit",
        budget=budget,
        max_tokens=3000,
        temperature=0.15,
        premium=premium,
    )


def analyze_short_clips(
    candidates: list[dict],
    budget: BudgetState,
    premium: bool = False,
) -> AIResult:
    """Enrich short candidates with titles and hooks."""
    import json as _json
    from tasks.prompts import SHORTS_ANALYZER_SYSTEM, SHORTS_ANALYZER_USER

    user_prompt = SHORTS_ANALYZER_USER.format(
        candidates_json=_json.dumps(candidates, ensure_ascii=False)[:5000],
    )
    return call_ai(
        system=SHORTS_ANALYZER_SYSTEM,
        user=user_prompt,
        task_type="shorts_analyzer",
        budget=budget,
        max_tokens=2500,
        temperature=0.25,
        premium=premium,
    )


def generate_thumbnail_layout(
    title: str,
    summary: str,
    primary_color: str,
    accent_color: str,
    budget: BudgetState,
    premium: bool = False,
) -> AIResult:
    """AI headline layout spec for thumbnail overlay."""
    from tasks.prompts import THUMBNAIL_LAYOUT_SYSTEM, THUMBNAIL_LAYOUT_USER

    user_prompt = THUMBNAIL_LAYOUT_USER.format(
        title=title[:200],
        summary=summary[:400],
        primary_color=primary_color,
        accent_color=accent_color,
    )
    return call_ai(
        system=THUMBNAIL_LAYOUT_SYSTEM,
        user=user_prompt,
        task_type="thumbnail_layout",
        budget=budget,
        max_tokens=400,
        temperature=0.2,
        premium=premium,
    )
