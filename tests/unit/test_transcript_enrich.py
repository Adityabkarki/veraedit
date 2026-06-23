"""Tests for transcript enrichment pipeline."""
from tasks.transcript_enrich import (
    assign_speakers_pause_based,
    attach_word_confidence,
    enrich_transcript_for_storage,
    insert_silence_blocks,
)


def test_assign_speakers_alternates_on_pause():
    words = [
        {"word": "hello", "start": 0.0, "end": 0.5},
        {"word": "world", "start": 2.0, "end": 2.5},
    ]
    enriched, speakers = assign_speakers_pause_based(words)
    assert enriched[0]["speaker"] == "A"
    assert enriched[1]["speaker"] == "B"
    assert len(speakers) == 2


def test_insert_silence_blocks():
    words = [
        {"word": "a", "start": 0.0, "end": 0.5, "speaker": "A", "type": "word"},
        {"word": "b", "start": 1.5, "end": 2.0, "speaker": "A", "type": "word"},
    ]
    result = insert_silence_blocks(words, min_gap=0.4)
    silence = [w for w in result if w.get("type") == "silence"]
    assert len(silence) == 1
    assert silence[0]["start"] == 0.5


def test_attach_word_confidence():
    words = [{"word": "test", "start": 1.0, "end": 1.5}]
    segments = [{"start": 0.0, "end": 2.0, "avg_logprob": -0.2}]
    out = attach_word_confidence(words, segments)
    assert 0.0 < out[0]["confidence"] <= 1.0


def test_enrich_transcript_for_storage():
    words = [
        {"word": "नमस्ते", "start": 0.0, "end": 0.4},
        {"word": "साथी", "start": 1.2, "end": 1.6},
    ]
    segments = [{"start": 0.0, "end": 2.0, "avg_logprob": -0.25}]
    enriched, speakers = enrich_transcript_for_storage(words, segments)
    assert len(speakers) >= 2
    assert any(w.get("speaker") for w in enriched)
