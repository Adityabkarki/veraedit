"""Tests for transcript quality scoring."""
from tasks.transcript_quality import compute_transcript_quality, grade_from_avg_confidence


def test_grade_from_avg_confidence():
    assert grade_from_avg_confidence(0.9) == "A"
    assert grade_from_avg_confidence(0.8) == "B"
    assert grade_from_avg_confidence(0.7) == "C"
    assert grade_from_avg_confidence(0.5) == "D"


def test_compute_transcript_quality_with_confidence():
    words = [
        {"word": "नमस्ते", "start": 0, "end": 0.5, "confidence": 0.95, "type": "word"},
        {"word": "साथी", "start": 0.6, "end": 1.0, "confidence": 0.6, "type": "word"},
    ]
    q = compute_transcript_quality(words)
    assert q["word_count"] == 2
    assert q["quality_grade"] in ("A", "B", "C", "D")
    assert "avg_confidence" in q


def test_compute_transcript_quality_from_segments_fallback():
    q = compute_transcript_quality([], segments=[{"avg_logprob": -0.2}])
    assert q["avg_confidence"] > 0.7
