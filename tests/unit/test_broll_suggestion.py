"""
Tests for tasks/broll_suggestion.py — AI B-Roll suggestion engine.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from tasks.broll_suggestion import (
    BRollSuggestion,
    _normalize_broll_window,
    run_broll_suggestion_engine,
    suggest_broll_from_transcript,
)


class FakeAIResult:
    content: list | str
    raw_text: str = ""
    model: str = "gpt-4o-mini"
    provider: str = "openai"
    input_tokens: int = 50
    output_tokens: int = 200
    cost_usd: float = 0.0002
    duration_s: float = 1.5
    from_cache: bool = False

    def __init__(self, content):
        self.content = content


SAMPLE_WORDS = [
    {"word": "Hello", "start": 0.0, "end": 0.5},
    {"word": "and", "start": 0.5, "end": 0.7},
    {"word": "welcome", "start": 0.7, "end": 1.2},
    {"word": "to", "start": 1.2, "end": 1.4},
    {"word": "today's", "start": 1.4, "end": 1.7},
    {"word": "video", "start": 1.7, "end": 2.0},
    {"word": "about", "start": 2.0, "end": 2.3},
    {"word": "machine", "start": 2.3, "end": 2.6},
    {"word": "learning", "start": 2.6, "end": 2.9},
    {"word": "algorithms", "start": 2.9, "end": 3.5},
]


def test_suggest_broll_from_transcript_returns_list():
    """Smoke test: engine returns a list given valid input."""
    result = suggest_broll_from_transcript(
        full_text="Hello and welcome to today's video about machine learning algorithms.",
        words=SAMPLE_WORDS,
        duration=10.0,
    )
    assert isinstance(result, list)


def test_suggest_broll_from_transcript_empty_text():
    """Empty transcript yields empty list."""
    result = suggest_broll_from_transcript("", [], 10.0)
    assert result == []


@patch("tasks.ai_client.call_ai")
def test_run_broll_suggestion_engine_parses_llm_output(mock_call_ai):
    """Verify engine correctly parses structured LLM output into action dicts."""
    mock_call_ai.return_value = FakeAIResult([
        {
            "start_time": 2.5,
            "end_time": 5.0,
            "broll_prompt": "A split-screen animation of neural network layers",
            "broll_reason": "technical_term",
            "confidence": 0.92,
        },
        {
            "start_time": 7.0,
            "end_time": 10.0,
            "broll_prompt": "Shot of a server room with blinking lights",
            "broll_reason": "abstract_concept",
            "confidence": 0.78,
        },
    ])

    actions = run_broll_suggestion_engine(
        full_text="Hello and welcome to today's video about machine learning algorithms.",
        words=SAMPLE_WORDS,
        duration=30.0,
    )

    assert len(actions) == 2

    first = actions[0]
    assert first["suggested_visual"] == "ai_broll"
    assert first["visual_type"] == "broll"
    assert first["broll_reason"] == "technical_term"
    assert first["start_time"] == 2.5
    assert first["end_time"] == 5.0
    assert first["generation_status"] == "pending"
    assert "broll_prompt" in first
    assert "display_value" in first

    second = actions[1]
    assert second["broll_reason"] == "abstract_concept"
    assert second["confidence"] == 0.78


@patch("tasks.ai_client.call_ai")
def test_run_broll_suggestion_engine_empty_llm_result(mock_call_ai):
    """Empty LLM result returns empty list."""
    mock_call_ai.return_value = FakeAIResult([])
    actions = run_broll_suggestion_engine(
        full_text="Some text here.",
        words=SAMPLE_WORDS,
        duration=10.0,
    )
    assert actions == []


@patch("tasks.ai_client.call_ai")
def test_run_broll_suggestion_engine_llm_failure(mock_call_ai):
    """LLM failure (exception) returns empty list."""
    mock_call_ai.side_effect = RuntimeError("API unavailable")
    actions = run_broll_suggestion_engine(
        full_text="Some text here.",
        words=SAMPLE_WORDS,
        duration=10.0,
    )
    assert actions == []


def test_normalize_broll_window_expands_point_anchor():
    """Equal start/end timestamps become a usable clip window."""
    ss, et = _normalize_broll_window(1.4, 1.4, duration=116.4)
    assert ss == pytest.approx(0.9)
    assert et == pytest.approx(4.9)
    assert et - ss >= 1.5


@patch("tasks.ai_client.call_ai")
def test_run_broll_suggestion_engine_expands_point_timestamps(mock_call_ai):
    """LLM point anchors (start==end) should still produce suggestions."""
    mock_call_ai.return_value = FakeAIResult([
        {
            "start_time": 1.4,
            "end_time": 1.4,
            "broll_prompt": "Smartphone showing Play Store search",
            "broll_reason": "technical_term",
            "confidence": 0.9,
        },
        {
            "start_time": 5.3,
            "end_time": 5.3,
            "broll_prompt": "Bhagavad Gita book cover split screen",
            "broll_reason": "story_narrative",
            "confidence": 0.85,
        },
    ])

    actions = run_broll_suggestion_engine(
        full_text="Sample transcript about Bhagavad Gita mobile app.",
        words=SAMPLE_WORDS,
        duration=116.4,
    )

    assert len(actions) == 2
    assert actions[0]["end_time"] > actions[0]["start_time"]
    assert actions[1]["end_time"] > actions[1]["start_time"]


def test_broll_suggestion_to_action_dict():
    """Verify BRollSuggestion dataclass serializes correctly."""
    sug = BRollSuggestion(
        start_time=1.0,
        end_time=4.5,
        broll_prompt="An office with people collaborating",
        broll_reason="topic_transition",
        confidence=0.85,
        text_excerpt="next we'll cover teamwork",
        duration_seconds=4.0,
    )
    d = sug.to_action_dict()
    assert d["start_time"] == 1.0
    assert d["end_time"] == 4.5
    assert d["broll_prompt"] == "An office with people collaborating"
    assert d["broll_reason"] == "topic_transition"
    assert d["suggested_visual"] == "ai_broll"
    assert d["generation_status"] == "pending"
    assert d["confidence"] == 0.85
