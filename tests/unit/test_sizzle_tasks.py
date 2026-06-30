"""
Unit tests for sizzle task word remapping (Phase 05).
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

from tasks.sizzle_tasks import _remap_words_for_montage


def test_remap_words_offsets_each_fragment():
    transcript = {
        "words": [
            {"word": "hello", "start": 1.0, "end": 1.5},
            {"word": "wow", "start": 11.0, "end": 11.4},
        ],
    }
    fragments = [
        {"start": 0.0, "end": 3.0},
        {"start": 10.0, "end": 12.0},
    ]
    remapped = _remap_words_for_montage(transcript, fragments)
    assert len(remapped) == 2
    assert remapped[0]["start"] == 1.0
    assert remapped[1]["start"] == pytest.approx(4.0)  # 11 - 10 + 3s offset


def test_remap_words_empty_when_no_fragments():
    assert _remap_words_for_montage({"words": [{"start": 0, "end": 1}]}, []) == []
