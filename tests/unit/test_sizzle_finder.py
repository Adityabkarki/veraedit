"""
Unit tests for sizzle_finder (Phase 05).
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

from processors.sizzle_finder import (
    _find_sizzle_fallback,
    find_sizzle_moments,
)
from services.ai_budget import budget

SAMPLE_TRANSCRIPT = {
    "segments": [
        {"start": 0.0, "end": 3.0, "text": "Welcome everyone!"},
        {"start": 30.0, "end": 33.5, "text": "This is incredible!"},
        {"start": 60.0, "end": 63.0, "text": "Wait — what?!"},
        {"start": 120.0, "end": 123.0, "text": "हाहा, that is funny।"},
        {"start": 180.0, "end": 183.0, "text": "Bold claim right here."},
        {"start": 240.0, "end": 243.0, "text": "Final punchline!"},
    ],
}


class TestSizzleFinderFallback:
    def test_fallback_returns_short_spread_fragments(self):
        fragments = _find_sizzle_fallback(SAMPLE_TRANSCRIPT, 30.0, 6)
        assert len(fragments) >= 3
        for frag in fragments:
            assert frag["end"] > frag["start"]
            assert frag["end"] - frag["start"] <= 5.0

    def test_fallback_sorted_chronologically(self):
        fragments = _find_sizzle_fallback(SAMPLE_TRANSCRIPT, 30.0, 5)
        starts = [f["start"] for f in fragments]
        assert starts == sorted(starts)

    def test_fallback_empty_transcript(self):
        assert _find_sizzle_fallback({"segments": []}, 30.0, 5) == []


class TestSizzleFinderEntry:
    @pytest.mark.asyncio
    async def test_uses_semantic_when_available(self, monkeypatch):
        budget.reset()
        fake = [
            {"start": 0.0, "end": 2.5, "energy_score": 90, "reason": "Hook"},
            {"start": 60.0, "end": 63.0, "energy_score": 85, "reason": "Surprise"},
        ]

        async def _ok(*_a, **_k):
            return fake

        monkeypatch.setattr(
            "processors.sizzle_finder._find_sizzle_semantic",
            _ok,
        )
        result = await find_sizzle_moments(SAMPLE_TRANSCRIPT, 30.0, 6)
        assert result == fake

    @pytest.mark.asyncio
    async def test_falls_back_on_semantic_failure(self, monkeypatch):
        budget.reset()

        async def _fail(*_a, **_k):
            raise RuntimeError("api down")

        monkeypatch.setattr(
            "processors.sizzle_finder._find_sizzle_semantic",
            _fail,
        )
        result = await find_sizzle_moments(SAMPLE_TRANSCRIPT, 30.0, 6)
        assert len(result) >= 1
