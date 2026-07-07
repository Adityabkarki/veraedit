"""Tests for Director B-roll confidence scoring."""
from __future__ import annotations

from services.director.broll_confidence import (
    MATCH_THRESHOLD,
    PARTIAL_THRESHOLD,
    is_usable_broll_confidence,
    pick_best_broll_match,
    score_broll_match,
)


def test_score_broll_match_uses_positional_prior():
    first = score_broll_match("office meeting", 0)
    third = score_broll_match("office meeting", 2)
    assert first > third
    assert first >= PARTIAL_THRESHOLD


def test_score_broll_match_boosts_tag_overlap():
    with_tags = score_broll_match("corporate office", 1, tags="corporate business office")
    bare = score_broll_match("corporate office", 1)
    assert with_tags >= bare


def test_pick_best_broll_match_returns_highest():
    results = [
        {"video_url": "a", "id": 1},
        {"video_url": "b", "id": 2, "title": "corporate office team"},
    ]
    best, score = pick_best_broll_match("corporate office", results)
    assert best is not None
    assert score > 0
    assert is_usable_broll_confidence(score) or score < PARTIAL_THRESHOLD


def test_threshold_constants():
    assert MATCH_THRESHOLD == 0.75
    assert PARTIAL_THRESHOLD == 0.45
