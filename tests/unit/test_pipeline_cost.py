"""Unit tests for pipeline cost estimates and confirmation phrases."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

from services.pipeline_cost import (
    CONFIRM_CHAPTERS,
    CONFIRM_SHORTS,
    CONFIRM_TRANSCRIPTION,
    confirmation_matches,
    estimate_chapters_analysis_cost_usd,
    estimate_remaining_stt_cost_usd,
    estimate_stt_cost_usd,
)


class TestPipelineCost:
    def test_confirmation_phrases_case_insensitive(self):
        assert confirmation_matches("Regenerate", CONFIRM_TRANSCRIPTION)
        assert confirmation_matches("  regenerate chapters  ", CONFIRM_CHAPTERS)
        assert confirmation_matches("REGENERATE SHORTS", CONFIRM_SHORTS)

    def test_stt_cost_scales_with_duration(self):
        short = estimate_stt_cost_usd(60)
        long = estimate_stt_cost_usd(600)
        assert long > short

    def test_resume_cost_less_than_full(self):
        full = estimate_stt_cost_usd(3600)
        partial = estimate_remaining_stt_cost_usd(3600, completed_chunks=2, total_chunks=4)
        assert partial < full
        assert partial > 0

    def test_chapters_cost_positive(self):
        assert estimate_chapters_analysis_cost_usd(600) > 0
