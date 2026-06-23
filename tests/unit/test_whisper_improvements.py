"""Tests for Whisper regenerate prompt and overlap dedup."""
from tasks.whisper import TranscriptWord, _dedupe_overlap_words, build_regenerate_prompt


def test_build_regenerate_prompt_includes_previous_text():
    prompt = build_regenerate_prompt("नमस्ते साथीहरू")
    assert "नमस्ते" in prompt
    assert "Improve" in prompt or "Nepali" in prompt


def test_dedupe_overlap_words():
    words = [
        TranscriptWord("hello", 10.0, 10.5),
        TranscriptWord("hello", 10.02, 10.52),
        TranscriptWord("world", 10.6, 11.0),
    ]
    deduped = _dedupe_overlap_words(words)
    assert len(deduped) == 2
    assert deduped[0].word == "hello"
    assert deduped[1].word == "world"
