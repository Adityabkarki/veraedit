"""
Tests for the Model Router + OpenAI LLM client + AI client.

Covers:
  - Budget tier selection (primary / fallback_8b / local / blocked)
  - Model selection per task type
  - Premium override → Claude
  - BudgetState accumulation
  - Budget exceeded error
  - OpenAI LLM client JSON extraction
  - OpenAI LLM cost calculation
  - Redis cache key generation (deterministic)
  - AI client routes correctly by provider
  - Cost constants are within expected range
"""
from __future__ import annotations

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../apps/api"))


# ─────────────────────────────────────────────────────────────────────────────
# BudgetState Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestBudgetState:

    def test_initial_state_zero(self):
        from tasks.model_router import BudgetState
        b = BudgetState()
        assert b.accumulated_usd == 0.0
        assert b.call_count == 0

    def test_add_accumulates(self):
        from tasks.model_router import BudgetState
        b = BudgetState()
        b.add(0.05)
        b.add(0.10)
        assert b.accumulated_usd == pytest.approx(0.15, abs=1e-6)
        assert b.call_count == 2

    def test_remaining_decreases(self):
        from tasks.model_router import BudgetState, BUDGET_LIMIT_USD
        b = BudgetState()
        b.add(0.50)
        assert b.remaining() == pytest.approx(BUDGET_LIMIT_USD - 0.50, abs=1e-6)

    def test_remaining_never_negative(self):
        from tasks.model_router import BudgetState
        b = BudgetState()
        b.add(99.0)  # way over budget
        assert b.remaining() == 0.0

    def test_tier_primary_at_zero(self):
        from tasks.model_router import BudgetState
        b = BudgetState()
        assert b.tier() == "primary"

    def test_tier_primary_below_downgrade1(self):
        from tasks.model_router import BudgetState, TIER_DOWNGRADE_1
        b = BudgetState()
        b.add(TIER_DOWNGRADE_1 - 0.01)
        assert b.tier() == "primary"

    def test_tier_fallback_8b_at_downgrade1(self):
        from tasks.model_router import BudgetState, TIER_DOWNGRADE_1
        b = BudgetState()
        b.add(TIER_DOWNGRADE_1)
        assert b.tier() == "fallback_8b"

    def test_tier_local_at_downgrade2(self):
        from tasks.model_router import BudgetState, TIER_DOWNGRADE_2
        b = BudgetState()
        b.add(TIER_DOWNGRADE_2)
        assert b.tier() == "local"

    def test_tier_blocked_at_limit(self):
        from tasks.model_router import BudgetState, BUDGET_LIMIT_USD
        b = BudgetState()
        b.add(BUDGET_LIMIT_USD)
        assert b.tier() == "blocked"


# ─────────────────────────────────────────────────────────────────────────────
# Model Selection Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestModelSelection:

    def _fresh_budget(self) -> "BudgetState":
        from tasks.model_router import BudgetState
        return BudgetState()

    def test_scene_analysis_uses_openai_by_default(self):
        from tasks.model_router import select_model, OPENAI_PRIMARY
        sel = select_model("scene_analysis", self._fresh_budget())
        assert sel.model_id == OPENAI_PRIMARY
        assert sel.provider == "openai"

    def test_suggestions_uses_openai_primary(self):
        from tasks.model_router import select_model, OPENAI_PRIMARY
        sel = select_model("suggestions", self._fresh_budget())
        assert sel.model_id == OPENAI_PRIMARY

    def test_hook_rewrite_uses_openai_primary(self):
        from tasks.model_router import select_model, OPENAI_PRIMARY
        sel = select_model("hook_rewrite", self._fresh_budget())
        assert sel.model_id == OPENAI_PRIMARY

    def test_filler_detection_uses_gpt_4o_mini(self):
        from tasks.model_router import select_model, OPENAI_PRIMARY
        sel = select_model("filler_detection", self._fresh_budget())
        assert sel.model_id == OPENAI_PRIMARY
        assert sel.model_name == "gpt-4o-mini"

    def test_budget_downgrade_still_uses_gpt_4o_mini(self):
        from tasks.model_router import select_model, OPENAI_PRIMARY, BudgetState, TIER_DOWNGRADE_1
        b = BudgetState()
        b.add(TIER_DOWNGRADE_1)  # trigger fallback tier label
        sel = select_model("scene_analysis", b)
        assert sel.model_id == OPENAI_PRIMARY
        assert sel.model_name == "gpt-4o-mini"
        assert sel.tier == "fallback_8b"

    def test_budget_exceeded_raises(self):
        from tasks.model_router import select_model, BudgetState, BUDGET_LIMIT_USD, BudgetExceededError
        b = BudgetState()
        b.add(BUDGET_LIMIT_USD + 0.01)
        with pytest.raises(BudgetExceededError):
            select_model("scene_analysis", b)

    def test_premium_returns_claude(self):
        from tasks.model_router import select_model, CLAUDE_SONNET
        # Need a mock ANTHROPIC_API_KEY
        import os
        original = os.environ.get("ANTHROPIC_API_KEY", "")
        os.environ["ANTHROPIC_API_KEY"] = "sk-ant-test"
        try:
            from config import settings
            # Reload config to pick up env var
            import importlib, config as cfg_module
            cfg_module.settings = cfg_module.Settings()

            b = self._fresh_budget()
            sel = select_model("scene_analysis", b, premium=True)
            assert sel.model_id == CLAUDE_SONNET
            assert sel.is_premium is True
            assert sel.tier == "premium"
        finally:
            if original:
                os.environ["ANTHROPIC_API_KEY"] = original
            else:
                os.environ.pop("ANTHROPIC_API_KEY", None)
            cfg_module.settings = cfg_module.Settings()

    def test_premium_without_key_falls_back_to_openai(self):
        """If premium requested but no Anthropic key, fall back to OpenAI."""
        import os
        original = os.environ.get("ANTHROPIC_API_KEY", "")
        os.environ.pop("ANTHROPIC_API_KEY", None)
        try:
            import importlib, config as cfg_module
            cfg_module.settings = cfg_module.Settings()

            from tasks.model_router import select_model
            sel = select_model("scene_analysis", self._fresh_budget(), premium=True)
            assert sel.provider == "openai"
        finally:
            if original:
                os.environ["ANTHROPIC_API_KEY"] = original
                import config as cfg_module
                cfg_module.settings = cfg_module.Settings()

    def test_tier_is_primary_by_default(self):
        from tasks.model_router import select_model
        sel = select_model("scene_analysis", self._fresh_budget())
        assert sel.tier == "primary"

    def test_reason_string_is_non_empty(self):
        from tasks.model_router import select_model
        sel = select_model("scene_analysis", self._fresh_budget())
        assert len(sel.reason) > 0

    def test_all_task_types_resolve(self):
        from tasks.model_router import select_model, TASK_MODEL_MAP
        b = self._fresh_budget()
        for task_type in TASK_MODEL_MAP:
            sel = select_model(task_type, b)
            assert sel.model_id is not None
            assert sel.provider in ("openai", "anthropic")

    def test_unknown_task_type_defaults_to_openai_primary(self):
        from tasks.model_router import select_model, OPENAI_PRIMARY
        sel = select_model("some_unknown_task", self._fresh_budget())
        assert sel.model_id == OPENAI_PRIMARY


# ─────────────────────────────────────────────────────────────────────────────
# OpenAI LLM Client Tests (pure logic, no network)
# ─────────────────────────────────────────────────────────────────────────────

class TestOpenAILLMClientLogic:

    def test_cost_calculation_primary(self):
        from tasks.openai_llm_client import _calculate_cost, OPENAI_MODEL_PRIMARY
        cost = _calculate_cost(OPENAI_MODEL_PRIMARY, input_tokens=1_000_000, output_tokens=0)
        assert cost == pytest.approx(0.15, rel=0.01)

    def test_cost_calculation_fast(self):
        from tasks.openai_llm_client import _calculate_cost, OPENAI_MODEL_FAST
        cost = _calculate_cost(OPENAI_MODEL_FAST, input_tokens=1_000_000, output_tokens=0)
        assert cost == pytest.approx(0.15, rel=0.01)

    def test_extract_json_direct(self):
        from tasks.groq_llm_client import _extract_json
        result = _extract_json('{"key": "value"}')
        assert result == {"key": "value"}

    def test_extract_json_with_fence(self):
        from tasks.groq_llm_client import _extract_json
        result = _extract_json('```json\n{"scenes": []}\n```')
        assert result == {"scenes": []}

    def test_extract_json_with_preamble(self):
        from tasks.groq_llm_client import _extract_json
        text = 'Here is the analysis:\n{"result": "ok"}\nEnd.'
        result = _extract_json(text)
        assert result == {"result": "ok"}

    def test_extract_json_preserves_nepali(self):
        import json
        from tasks.groq_llm_client import _extract_json
        data = {"text": "नमस्ते साथीहरू"}
        raw = json.dumps(data, ensure_ascii=False)
        result = _extract_json(raw)
        assert result["text"] == "नमस्ते साथीहरू"

    def test_extract_json_invalid_raises(self):
        from tasks.groq_llm_client import _extract_json
        with pytest.raises(ValueError):
            _extract_json("This is not JSON at all.")

    def test_estimate_cost_returns_dict(self):
        from tasks.groq_llm_client import estimate_cost
        result = estimate_cost("system prompt", "user prompt")
        assert "input_tokens" in result
        assert "output_tokens" in result
        assert "total_usd" in result

    def test_estimate_cost_longer_costs_more(self):
        from tasks.groq_llm_client import estimate_cost
        short = estimate_cost("s", "u")
        long_ = estimate_cost("s" * 1000, "u" * 1000)
        assert long_["total_usd"] > short["total_usd"]

    def test_openai_cheaper_per_token_than_claude(self):
        """gpt-4o-mini must be significantly cheaper than Claude Sonnet."""
        from tasks.openai_llm_client import _calculate_cost, OPENAI_MODEL_PRIMARY
        openai_cost = _calculate_cost(OPENAI_MODEL_PRIMARY, 100_000, 50_000)
        claude_cost = 100_000 * 3 / 1_000_000 + 50_000 * 15 / 1_000_000
        assert openai_cost < claude_cost * 0.3

    def test_1hr_video_within_budget(self):
        """
        Verify the full cost for 1hr video analysis stays within $2 budget.
        Based on cost-and-multicam.md breakdown.
        """
        from tasks.openai_llm_client import _calculate_cost, OPENAI_MODEL_PRIMARY
        transcription = 0.50  # ElevenLabs Scribe ~$0.50/hr

        scene_cost = _calculate_cost(OPENAI_MODEL_PRIMARY, 80 * 800, 80 * 400)
        suggestion_cost = _calculate_cost(OPENAI_MODEL_PRIMARY, 3000, 1500)
        hook_cost = _calculate_cost(OPENAI_MODEL_PRIMARY, 500, 800)

        total = transcription + scene_cost + suggestion_cost + hook_cost
        assert total < 1.00, f"1hr video costs ${total:.4f} — expected < $1.00"
        assert total < 2.00, "Must be within $2 budget"


# ─────────────────────────────────────────────────────────────────────────────
# Cache key Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestCacheKeys:

    def test_same_inputs_produce_same_key(self):
        from tasks.model_router import _cache_key
        k1 = _cache_key("openai/gpt-4o-mini", "system", "user")
        k2 = _cache_key("openai/gpt-4o-mini", "system", "user")
        assert k1 == k2

    def test_different_model_different_key(self):
        from tasks.model_router import _cache_key
        k1 = _cache_key("openai/gpt-4o-mini", "system", "user")
        k2 = _cache_key("openai/gpt-4o", "system", "user")
        assert k1 != k2

    def test_different_prompt_different_key(self):
        from tasks.model_router import _cache_key
        k1 = _cache_key("openai/gpt-4o-mini", "system", "user A")
        k2 = _cache_key("openai/gpt-4o-mini", "system", "user B")
        assert k1 != k2

    def test_key_has_prefix(self):
        from tasks.model_router import _cache_key, CACHE_KEY_PREFIX
        k = _cache_key("model", "system", "user")
        assert k.startswith(CACHE_KEY_PREFIX)

    def test_key_is_fixed_length(self):
        """Cache key length should be consistent (prefix + 32 hex chars)."""
        from tasks.model_router import _cache_key, CACHE_KEY_PREFIX
        k = _cache_key("model", "s", "u")
        expected_len = len(CACHE_KEY_PREFIX) + 32
        assert len(k) == expected_len


# ─────────────────────────────────────────────────────────────────────────────
# AI Client Integration Tests (import/structure checks)
# ─────────────────────────────────────────────────────────────────────────────

class TestAIClientStructure:

    def test_ai_result_has_required_fields(self):
        from tasks.ai_client import AIResult
        import dataclasses
        fields = {f.name for f in dataclasses.fields(AIResult)}
        for required in ("content", "model", "provider", "input_tokens", "output_tokens", "cost_usd"):
            assert required in fields

    def test_ai_client_exposes_analyze_scenes(self):
        from tasks.ai_client import analyze_scenes
        assert callable(analyze_scenes)

    def test_ai_client_exposes_generate_suggestions(self):
        from tasks.ai_client import generate_suggestions
        assert callable(generate_suggestions)

    def test_ai_client_exposes_generate_hooks_ai(self):
        from tasks.ai_client import generate_hooks_ai
        assert callable(generate_hooks_ai)

    def test_analyze_task_imports_from_ai_client(self):
        """analyze.py must no longer import directly from claude_client."""
        import inspect
        import tasks.analyze as m
        src = inspect.getsource(m)
        # Should import from ai_client, not directly from claude_client
        assert "from tasks.ai_client import" in src
        # Must NOT import analyze_scenes/generate_suggestions from claude_client
        assert "from tasks.claude_client import analyze_scenes" not in src
        assert "from tasks.claude_client import generate_suggestions" not in src

    def test_budget_state_passed_to_ai_calls(self):
        """analyze.py must create and pass a BudgetState."""
        import inspect
        import tasks.analyze as m
        src = inspect.getsource(m)
        assert "BudgetState" in src
        assert "budget=" in src

    def test_model_router_budget_summary_callable(self):
        from tasks.model_router import budget_summary, BudgetState
        b = BudgetState()
        b.add(0.05)
        summary = budget_summary(b)
        assert "accumulated_usd" in summary
        assert "remaining_usd" in summary
        assert "tier" in summary
        assert "pct_used" in summary

    def test_hooks_py_does_not_import_claude_directly(self):
        """hooks.py must not call Anthropic directly — must go via ai_client."""
        import inspect
        import tasks.hooks as m
        src = inspect.getsource(m)
        assert "from anthropic" not in src
        assert "Anthropic()" not in src

    def test_openai_client_pricing_constants(self):
        from tasks.openai_llm_client import _PRICING, OPENAI_MODEL_PRIMARY
        assert _PRICING[OPENAI_MODEL_PRIMARY]["input"] == pytest.approx(0.15 / 1_000_000, rel=0.01)
        assert _PRICING[OPENAI_MODEL_PRIMARY]["output"] == pytest.approx(0.60 / 1_000_000, rel=0.01)


# ─────────────────────────────────────────────────────────────────────────────
# Hook output format tests
# ─────────────────────────────────────────────────────────────────────────────

class TestHookOutputFormat:

    def test_hook_prompt_requests_nepali_field(self):
        from tasks.hooks import _HOOK_USER
        assert '"nepali"' in _HOOK_USER

    def test_hook_prompt_requests_instruction_field(self):
        from tasks.hooks import _HOOK_USER
        assert '"instruction"' in _HOOK_USER

    def test_hook_prompt_requests_rationale_field(self):
        from tasks.hooks import _HOOK_USER
        assert '"rationale"' in _HOOK_USER

    def test_hook_prompt_requests_retention_boost(self):
        from tasks.hooks import _HOOK_USER
        assert "estimated_retention_boost" in _HOOK_USER

    def test_hook_system_specifies_devanagari(self):
        from tasks.hooks import _HOOK_SYSTEM
        assert "Devanagari" in _HOOK_SYSTEM or "Nepali" in _HOOK_SYSTEM

    def test_hook_system_specifies_english_instruction(self):
        """System prompt must ask for English instructions alongside Nepali text."""
        from tasks.hooks import _HOOK_SYSTEM
        assert "English" in _HOOK_SYSTEM or "instruction" in _HOOK_SYSTEM.lower()

    def test_pick_best_hook_uses_retention_boost(self):
        from tasks.hooks import pick_best_hook
        hooks = [
            {"type": "direct_address", "estimated_retention_boost": 0.15,
             "nepali": "साथीहरू", "instruction": "...", "rationale": "..."},
            {"type": "bold_claim", "estimated_retention_boost": 0.30,
             "nepali": "यो", "instruction": "...", "rationale": "..."},
        ]
        best = pick_best_hook(hooks)
        assert best["type"] == "bold_claim"
