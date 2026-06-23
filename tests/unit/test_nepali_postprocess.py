"""Tests for Nepali transcript post-processor."""
from tasks.nepali_postprocess import normalize_devanagari, postprocess_transcript_words


def test_normalize_devanagari_nfc():
    text = "नेपाल"
    assert normalize_devanagari(text) == text


def test_postprocess_preserves_timing():
    words = [{"word": "  नेपाल  ", "start": 0.0, "end": 0.5}]
    out = postprocess_transcript_words(words)
    assert out[0]["start"] == 0.0
    assert out[0]["word"].strip() == "नेपाल"
