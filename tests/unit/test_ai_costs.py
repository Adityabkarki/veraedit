"""
Unit tests for AI cost helpers (Phase 07).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


class TestAICosts:
    def test_estimate_elevenlabs_cost(self):
        from services.ai_costs import estimate_elevenlabs_cost

        assert estimate_elevenlabs_cost(60) > 0
        assert estimate_elevenlabs_cost(0) == 0

    def test_estimate_text_call_cost_scales_with_prompt(self):
        from services.ai_costs import estimate_text_call_cost

        short = estimate_text_call_cost("hello")
        long = estimate_text_call_cost("hello " * 500)
        assert long > short
