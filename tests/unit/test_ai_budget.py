"""
Unit tests for extended AI budget tracker (Phase 07).
"""
import os
import sys
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


class TestAIBudgetTracker:
    def test_record_accumulates(self):
        from services.ai_budget import AIBudgetTracker

        tracker = AIBudgetTracker()
        tracker.record(0.00015, action="asset_tagging")
        tracker.record(0.0003, action="asset_tag_video")
        assert tracker.total_usd == pytest.approx(0.00045)
        assert len(tracker.actions) == 2

    def test_hourly_spend_uses_rolling_window(self, monkeypatch):
        from services import ai_budget as mod

        tracker = mod.AIBudgetTracker()
        old_time = 1_000_000.0
        monkeypatch.setattr(mod.time, "time", lambda: old_time)
        tracker.record(0.01, action="old")

        monkeypatch.setattr(mod.time, "time", lambda: old_time + 4000)
        tracker.record(0.02, action="new")

        assert tracker.hourly_spend == pytest.approx(0.02)

    def test_persist_called_when_project_context_given(self, monkeypatch):
        from services.ai_budget import AIBudgetTracker

        tracker = AIBudgetTracker()
        persist = MagicMock()
        monkeypatch.setattr(tracker, "_persist", persist)

        tracker.record(
            0.05,
            action="style_analyze",
            workspace_id="user-1",
            project_id="proj-1",
            provider="gemini",
        )

        persist.assert_called_once()
        assert persist.call_args.kwargs["action"] == "style_analyze"

    def test_should_use_local_when_ratio_exceeds_threshold(self, monkeypatch):
        from services import ai_budget as mod
        from config import settings

        tracker = mod.AIBudgetTracker()
        monkeypatch.setattr(settings, "AI_COST_LIMIT_USD_PER_HOUR", 1.0)
        monkeypatch.setattr(settings, "AI_BUDGET_HARD_LIMIT_SWITCH_LOCAL", 0.8)
        tracker.record(0.85, action="test", workspace_id="w1")

        assert tracker.should_use_local() is True

    def test_reset_clears_state(self):
        from services.ai_budget import AIBudgetTracker

        tracker = AIBudgetTracker()
        tracker.record(0.01, action="test")
        tracker.reset()
        assert tracker.total_usd == 0.0
        assert tracker.actions == []
        assert tracker.hourly_spend == 0.0
