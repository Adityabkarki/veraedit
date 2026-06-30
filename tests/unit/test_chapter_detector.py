"""
Unit tests for chapter_detector (Phase 04).
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

from processors.chapter_detector import (
    detect_chapters,
    detect_chapters_fallback,
    detect_chapters_semantic,
)
from services.ai_budget import budget


SAMPLE_TRANSCRIPT = {
    "segments": [
        {"start": 0.0, "end": 5.0, "text": "नमस्ते, आज हामी बारेमा कुरा गर्छौं।"},
        {"start": 5.5, "end": 12.0, "text": "पहिलो विषय यो हो।"},
        {"start": 15.0, "end": 22.0, "text": "अर्को महत्वपूर्ण कुरा।"},
        {"start": 25.0, "end": 90.0, "text": "यो लामो अध्याय हो।"},
        {"start": 93.0, "end": 150.0, "text": "अन्तिम भाग यहाँ छ।"},
    ],
}


class TestChapterDetectorFallback:
    def test_fallback_returns_chapters(self):
        chapters = detect_chapters_fallback(SAMPLE_TRANSCRIPT, min_chapter_duration=30.0)
        assert len(chapters) >= 1
        for ch in chapters:
            assert "start" in ch and "end" in ch
            assert ch["end"] > ch["start"]
            assert "title" in ch

    def test_fallback_empty_transcript(self):
        assert detect_chapters_fallback({"segments": []}) == []

    def test_fallback_merges_short_chapters(self):
        short_segments = {
            "segments": [
                {"start": 0.0, "end": 10.0, "text": "एक।"},
                {"start": 13.0, "end": 20.0, "text": "दुई।"},
                {"start": 23.0, "end": 80.0, "text": "तीन।"},
            ],
        }
        chapters = detect_chapters_fallback(short_segments, min_chapter_duration=60.0)
        assert len(chapters) == 1
        assert chapters[0]["end"] - chapters[0]["start"] >= 60.0 or chapters[0]["end"] == 80.0


class TestChapterDetectorSemantic:
    @pytest.mark.asyncio
    async def test_semantic_skipped_when_budget_exceeded(self, monkeypatch):
        budget.reset()
        monkeypatch.setattr(budget, "total_usd", 999.0)
        result = await detect_chapters_semantic(SAMPLE_TRANSCRIPT)
        assert result is None

    @pytest.mark.asyncio
    async def test_detect_chapters_falls_back_on_semantic_failure(self, monkeypatch):
        budget.reset()

        async def _fail(*_a, **_k):
            raise RuntimeError("api down")

        monkeypatch.setattr(
            "processors.chapter_detector.detect_chapters_semantic",
            _fail,
        )
        chapters = await detect_chapters(SAMPLE_TRANSCRIPT, min_chapter_duration=30.0)
        assert len(chapters) >= 1

    @pytest.mark.asyncio
    async def test_detect_chapters_uses_semantic_when_available(self, monkeypatch):
        budget.reset()
        fake = [
            {"start": 0.0, "end": 90.0, "title": "Intro", "summary": "Opening"},
            {"start": 90.0, "end": 150.0, "title": "Close", "summary": "Ending"},
        ]

        async def _ok(*_a, **_k):
            return fake

        monkeypatch.setattr(
            "processors.chapter_detector.detect_chapters_semantic",
            _ok,
        )
        chapters = await detect_chapters(SAMPLE_TRANSCRIPT)
        assert chapters == fake
