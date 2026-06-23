"""Unit tests for asset cost aggregation."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

from services.asset_cost_summary import provider_from_model, task_label


class TestAssetCostSummary:
    def test_provider_from_model(self):
        assert provider_from_model("elevenlabs/scribe_v2") == "elevenlabs"
        assert provider_from_model("openai/gpt-4o-mini") == "openai"
        assert provider_from_model("anthropic/claude-sonnet-4") == "anthropic"

    def test_task_label(self):
        assert "Chapter" in task_label("scene_analysis")
        assert "Transcription" in task_label("transcription")
