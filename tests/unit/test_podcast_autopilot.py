"""Tests for podcast autopilot suggestion builder."""
from tasks.podcast_autopilot import build_podcast_autopilot_suggestions


def test_podcast_autopilot_generates_filler_and_silence():
    words = [
        {"word": "uh", "start": 1.0, "end": 1.2},
        {"word": "hello", "start": 1.2, "end": 1.5},
        {"word": "world", "start": 3.0, "end": 3.5},
    ]
    scenes = [{"start_time": 0, "end_time": 10, "title": "Segment 1"}]
    sugs = build_podcast_autopilot_suggestions(words, scenes, "podcast")
    ops = [s["action"]["operation"] for s in sugs]
    assert "remove_fillers" in ops
    assert "trim_silence" in ops


def test_non_podcast_returns_empty():
    assert build_podcast_autopilot_suggestions([], [], "tutorial") == []
