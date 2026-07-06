"""Tests for pyannote diarization helpers."""
from __future__ import annotations

from services.diarization.pyannote_diarizer import (
    assign_speakers_from_diarization,
    diarize_audio_path,
)


def test_assign_speakers_from_diarization_maps_words():
    words = [
        {"word": "hello", "start": 0.0, "end": 0.5},
        {"word": "guest", "start": 2.0, "end": 2.5},
    ]
    segments = [
        {"start": 0.0, "end": 1.0, "speaker": "SPEAKER_00"},
        {"start": 2.0, "end": 3.0, "speaker": "SPEAKER_01"},
    ]
    enriched, speakers = assign_speakers_from_diarization(words, segments)
    assert enriched[0]["speaker"] == "A"
    assert enriched[1]["speaker"] == "B"
    assert speakers[0]["diarizationSource"] == "ml"


def test_diarize_audio_missing_file_returns_heuristic():
    segments, source = diarize_audio_path(__import__("pathlib").Path("/no/such/file.wav"))
    assert segments == []
    assert source == "heuristic"
