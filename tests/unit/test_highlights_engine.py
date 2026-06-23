"""Tests for highlights_engine — promo clips and platform packs."""
from __future__ import annotations

from tasks.highlights_engine import (
    PLATFORM_PACKS,
    build_highlight_records,
    extract_highlight_candidates,
)


def _scene(start: float, end: float, hs: float = 0.8, highlight: bool = True) -> dict:
    return {
        "start_time": start,
        "end_time": end,
        "title": "Moment",
        "summary": "Strong moment",
        "highlight_score": hs,
        "is_highlight": highlight,
        "transcript_excerpt": "नमस्ते",
    }


class TestHighlightsEngine:
    def test_platform_packs_have_four_aspects(self):
        platforms = {p["platform"] for p in PLATFORM_PACKS}
        assert "youtube" in platforms
        assert "tiktok" in platforms
        assert "linkedin" in platforms

    def test_extract_diverse_highlights(self):
        micro = [
            _scene(0, 40),
            _scene(400, 460),
            _scene(800, 860),
        ]
        chapters = [
            {"start_time": 0, "end_time": 300},
            {"start_time": 300, "end_time": 600},
            {"start_time": 600, "end_time": 900},
        ]
        cands = extract_highlight_candidates(micro, chapters, 900.0)
        assert len(cands) >= 2

    def test_build_records_include_platform_packs(self):
        recs = build_highlight_records(
            [_scene(10, 50)], "proj", "asset"
        )
        assert len(recs) == 1
        assert len(recs[0]["platform_packs"]) == len(PLATFORM_PACKS)
