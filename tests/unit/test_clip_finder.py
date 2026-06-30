"""
Unit tests for clip finder (Phase 03).

Run: pytest tests/unit/test_clip_finder.py -v
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


@pytest.mark.asyncio
async def test_find_viral_moments_from_segments():
    from processors.clip_finder import find_viral_moments

    transcript = {
        "words": [],
        "segments": [
            {"text": "Opening hook about the topic", "start": 0, "end": 20},
            {"text": "Middle explanation continues here", "start": 20, "end": 50},
            {"text": "Strong closing call to action!", "start": 50, "end": 70},
        ],
    }
    moments = await find_viral_moments(transcript, max_clips=3, target_duration=60)
    assert len(moments) >= 1
    assert moments[0]["start"] >= 0
    assert moments[0]["end"] > moments[0]["start"]
    assert "title" in moments[0]
    assert moments[0]["score"] > 0


@pytest.mark.asyncio
async def test_find_viral_moments_empty_transcript():
    from processors.clip_finder import find_viral_moments

    moments = await find_viral_moments({}, max_clips=5, target_duration=60)
    assert moments == []
