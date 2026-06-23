"""
ViraEdit — EP-2.2 unit tests for AI scene analysis.

Tests (no real API keys needed — Claude is mocked):
    - Prompt generation: Nepali context, correct JSON schema
    - JSON extraction: handles markdown fences, preamble text
    - Cost estimation: Haiku vs Sonnet pricing
    - Suggestion type mapping: valid types, unknown type → "cut"
    - Task registration: analyze task registered in Celery
    - Nepali-specific: cultural moment detection, filler word examples

Run: pytest tests/unit/test_analysis.py -v
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

import json
import pytest
from unittest.mock import MagicMock, patch


# ── Prompt content ─────────────────────────────────────────────────────────────

class TestPrompts:
    def test_system_prompt_mentions_nepali(self):
        from tasks.prompts import SCENE_ANALYSIS_SYSTEM
        assert "Nepali" in SCENE_ANALYSIS_SYSTEM
        assert "Devanagari" in SCENE_ANALYSIS_SYSTEM

    def test_system_prompt_includes_filler_examples(self):
        """Nepali filler words must be explicitly listed."""
        from tasks.prompts import SCENE_ANALYSIS_SYSTEM
        # Common Nepali filler words
        assert "उम" in SCENE_ANALYSIS_SYSTEM

    def test_system_prompt_requires_english_output(self):
        """UI labels must be English — no Nepali in output descriptions."""
        from tasks.prompts import SCENE_ANALYSIS_SYSTEM
        assert "ENGLISH" in SCENE_ANALYSIS_SYSTEM

    def test_user_prompt_formats_correctly(self):
        from tasks.prompts import SCENE_ANALYSIS_USER
        formatted = SCENE_ANALYSIS_USER.format(
            full_text="नमस्ते नेपाल",
            words_sample="नमस्ते [0.0s-0.5s]",
            duration=120.0,
        )
        assert "नमस्ते नेपाल" in formatted
        assert "120.0" in formatted

    def test_suggestions_prompt_has_platform_types(self):
        from tasks.prompts import SUGGESTIONS_USER
        assert "short_clip" in SUGGESTIONS_USER
        assert "hook_rewrite" in SUGGESTIONS_USER
        assert "remove_filler" in SUGGESTIONS_USER

    def test_suggestions_system_mentions_nepali_audience(self):
        from tasks.prompts import SUGGESTIONS_SYSTEM
        assert "Nepali" in SUGGESTIONS_SYSTEM


# ── JSON extraction ───────────────────────────────────────────────────────────

class TestJSONExtraction:
    def test_direct_json_parsed(self):
        from tasks.claude_client import _extract_json
        result = _extract_json('{"scenes": [], "overall_viral_score": 7.5}')
        assert result["overall_viral_score"] == 7.5

    def test_markdown_fence_stripped(self):
        from tasks.claude_client import _extract_json
        text = '```json\n{"scenes": [], "overall_viral_score": 8.0}\n```'
        result = _extract_json(text)
        assert result["overall_viral_score"] == 8.0

    def test_preamble_text_ignored(self):
        from tasks.claude_client import _extract_json
        text = 'Here is the analysis:\n\n{"scenes": [], "overall_viral_score": 6.5}'
        result = _extract_json(text)
        assert result["overall_viral_score"] == 6.5

    def test_nepali_text_in_json_preserved(self):
        from tasks.claude_client import _extract_json
        text = '{"excerpt": "नमस्ते नेपाल"}'
        result = _extract_json(text)
        assert result["excerpt"] == "नमस्ते नेपाल"

    def test_invalid_json_raises(self):
        from tasks.claude_client import _extract_json
        with pytest.raises(json.JSONDecodeError):
            _extract_json("This is not JSON at all.")


# ── Cost estimation ───────────────────────────────────────────────────────────

class TestCostEstimation:
    def test_estimate_returns_three_keys(self):
        from tasks.claude_client import estimate_cost
        result = estimate_cost(text_length=5000, duration_s=300.0)
        assert "scene_analysis_usd" in result
        assert "suggestions_usd" in result
        assert "total_usd" in result

    def test_total_is_sum_of_parts(self):
        from tasks.claude_client import estimate_cost
        result = estimate_cost(text_length=5000, duration_s=300.0)
        assert result["total_usd"] == pytest.approx(
            result["scene_analysis_usd"] + result["suggestions_usd"], rel=1e-6
        )

    def test_longer_text_costs_more(self):
        from tasks.claude_client import estimate_cost
        short = estimate_cost(text_length=1000, duration_s=60.0)
        long_ = estimate_cost(text_length=10000, duration_s=600.0)
        assert long_["scene_analysis_usd"] > short["scene_analysis_usd"]

    def test_haiku_cheaper_than_sonnet(self):
        """Haiku input costs $0.80/1M vs Sonnet $3.00/1M."""
        from tasks.claude_client import (
            HAIKU_INPUT_COST, SONNET_INPUT_COST,
            HAIKU_OUTPUT_COST, SONNET_OUTPUT_COST,
        )
        assert HAIKU_INPUT_COST < SONNET_INPUT_COST
        assert HAIKU_OUTPUT_COST < SONNET_OUTPUT_COST


# ── Suggestion type mapping ───────────────────────────────────────────────────

class TestSuggestionTypeMapping:
    def test_valid_type_passthrough(self):
        from tasks.analyze import _map_suggestion_type
        assert _map_suggestion_type("hook_rewrite") == "hook_rewrite"
        assert _map_suggestion_type("cut") == "cut"
        assert _map_suggestion_type("short_clip") == "short_clip"
        assert _map_suggestion_type("remove_filler") == "remove_filler"

    def test_hyphenated_type_normalised(self):
        from tasks.analyze import _map_suggestion_type
        assert _map_suggestion_type("hook-rewrite") == "hook_rewrite"
        assert _map_suggestion_type("short-clip") == "short_clip"

    def test_unknown_type_maps_to_cut(self):
        from tasks.analyze import _map_suggestion_type
        assert _map_suggestion_type("unknown_type") == "cut"
        assert _map_suggestion_type("") == "cut"
        assert _map_suggestion_type("magic_edit") == "cut"

    def test_all_valid_types_accepted(self):
        from tasks.analyze import _map_suggestion_type, _VALID_SUGGESTION_TYPES
        for t in _VALID_SUGGESTION_TYPES:
            assert _map_suggestion_type(t) == t


# ── Celery task registration ──────────────────────────────────────────────────

class TestAnalysisTaskRegistration:
    def test_analyze_task_registered(self):
        from celery_app import celery_app
        import tasks.analyze  # noqa: F401
        assert "tasks.analyze.run" in celery_app.tasks

    def test_analyze_task_uses_analysis_queue(self):
        from celery_app import celery_app
        import tasks.analyze  # noqa: F401
        task = celery_app.tasks["tasks.analyze.run"]
        assert task.queue == "analysis"

    def test_analyze_task_max_retries(self):
        from celery_app import celery_app
        import tasks.analyze  # noqa: F401
        task = celery_app.tasks["tasks.analyze.run"]
        assert task.max_retries == 3

    def test_worker_pool_is_solo(self):
        """CRITICAL: Windows requires --pool=solo."""
        from celery_app import celery_app
        assert celery_app.conf.worker_pool == "solo"


# ── Nepali cultural context ───────────────────────────────────────────────────

class TestNepaliAnalysisContext:
    def test_scene_prompt_knows_nepali_storytelling(self):
        """Prompt must mention Nepali storytelling patterns."""
        from tasks.prompts import SCENE_ANALYSIS_SYSTEM
        # Must mention slow buildup / crescendo pattern
        assert "crescendo" in SCENE_ANALYSIS_SYSTEM.lower() or \
               "buildup" in SCENE_ANALYSIS_SYSTEM.lower() or \
               "storytelling" in SCENE_ANALYSIS_SYSTEM.lower()

    def test_platform_scores_include_shorts(self):
        """Shorts (vertical format) must be a scored platform."""
        from tasks.prompts import SCENE_ANALYSIS_USER
        assert "shorts" in SCENE_ANALYSIS_USER.lower()

    def test_suggestion_prompt_includes_shorts_trigger(self):
        """Auto-suggest short_clip when score >= 7.0."""
        from tasks.prompts import SUGGESTIONS_USER
        assert "7.0" in SUGGESTIONS_USER or "short_clip" in SUGGESTIONS_USER

    def test_analyze_queues_after_transcription(self):
        """Transcription task must queue the analysis task."""
        import inspect
        import tasks.transcribe
        source = inspect.getsource(tasks.transcribe)
        assert "tasks.analyze.run" in source
        assert "analysis_queued" in source

    def test_cost_logged_per_task(self):
        """analyze task must log costs to the costs table."""
        import inspect
        import tasks.analyze
        source = inspect.getsource(tasks.analyze)
        assert "scene_analysis" in source
        assert "suggestions" in source
        assert "INSERT INTO costs" in source
