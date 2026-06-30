"""
Unit tests for AI budget tracker (Phase 00).

Run: pytest tests/unit/test_ai_budget.py -v
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


class TestAIBudgetTracker:
    def test_record_accumulates(self):
        from services.ai_budget import AIBudgetTracker

        tracker = AIBudgetTracker()
        tracker.record(0.00015, task="asset_tag_image")
        tracker.record(0.0003, task="asset_tag_video")
        assert tracker.total_usd == pytest.approx(0.00045)
        assert len(tracker.actions) == 2

    def test_reset_clears_state(self):
        from services.ai_budget import AIBudgetTracker

        tracker = AIBudgetTracker()
        tracker.record(0.01, task="test")
        tracker.reset()
        assert tracker.total_usd == 0.0
        assert tracker.actions == []
