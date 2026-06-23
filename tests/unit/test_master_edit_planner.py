"""Tests for master_edit_planner."""
from __future__ import annotations

from tasks.master_edit_planner import (
    build_rule_based_master_suggestions,
    map_llm_master_plan_to_suggestions,
)


class TestMasterEditPlanner:
    def test_rule_based_includes_filler_cut(self):
        fillers = [
            {
                "start_time": 10.0,
                "end_time": 12.0,
                "reason": "Repeated um",
                "recommended_cut": True,
            }
        ]
        sugs = build_rule_based_master_suggestions([], fillers, {}, "podcast")
        assert any(s["type"] == "remove_filler" for s in sugs)

    def test_map_llm_plan(self):
        plan = {
            "suggestions": [
                {
                    "type": "cut",
                    "title": "Trim tangent",
                    "description": "Off-topic",
                    "confidence": 0.9,
                    "impact": "high",
                    "action": {"action": "cut_range"},
                }
            ]
        }
        out = map_llm_master_plan_to_suggestions(plan)
        assert out[0]["action"].get("master_edit") is True
