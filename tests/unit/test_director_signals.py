"""Tests for Director Engine signal extraction."""
from services.director.extract_signals import extract_director_signals
from services.director.signals.phrase_spotting import extract_comparisons, extract_cta_phrases
from services.director.signals.speaker_diarization import extract_speaker_changes
from services.director.signals.stat_extraction import extract_stats
from services.director.signals.topic_segmentation import extract_topic_shifts


def test_extract_stats_finds_percentage():
    segments = [
        {"text": "Revenue grew 40% this quarter.", "start": 2.0, "end": 5.0},
    ]
    stats = extract_stats(segments)
    assert len(stats) >= 1
    assert stats[0]["value"] == "40%"
    assert stats[0]["label"] == "Revenue"


def test_topic_segmentation_splits_on_gaps():
    segments = [
        {"text": "First topic block.", "start": 0, "end": 3},
        {"text": "Still first topic.", "start": 3.2, "end": 6},
        {"text": "New topic after pause.", "start": 10, "end": 14},
    ]
    shifts = extract_topic_shifts(segments)
    assert len(shifts) == 2
    assert shifts[1]["topicLabel"]


def test_speaker_changes_from_pause_heuristic():
    words = [
        {"word": "Hello", "start": 0.0, "end": 0.4},
        {"word": "there", "start": 0.5, "end": 0.9},
        {"word": "pause", "start": 3.0, "end": 3.4},
        {"word": "guest", "start": 3.5, "end": 3.9},
    ]
    changes = extract_speaker_changes(words)
    assert len(changes) >= 2
    assert changes[0]["speakerId"] in ("A", "B")
    assert changes[0]["confidenceSource"] == "heuristic"


def test_speaker_changes_tag_ml_when_speakers_meta_says_so():
    words = [
        {"word": "Hello", "start": 0.0, "end": 0.4, "speaker": "A"},
        {"word": "guest", "start": 3.5, "end": 3.9, "speaker": "B"},
    ]
    speakers_meta = [{"id": "A", "diarizationSource": "ml"}]
    changes = extract_speaker_changes(words, speakers_meta)
    assert changes[0]["confidenceSource"] == "ml"
    assert changes[0]["confidence"] > 0.8


def test_comparison_and_cta_phrases():
    segments = [
        {"text": "Growth compared to last year was strong.", "start": 1, "end": 4},
        {"text": "Subscribe and hit the bell.", "start": 8, "end": 10},
    ]
    assert len(extract_comparisons(segments)) == 1
    assert len(extract_cta_phrases(segments)) == 1


def test_extract_director_signals_unified_payload():
    segments = [
        {"text": "Welcome to the podcast episode.", "start": 0, "end": 3},
        {"text": "Revenue grew 25% year over year.", "start": 5, "end": 8},
    ]
    payload = extract_director_signals(segments=segments, duration_seconds=10)
    assert payload["durationSeconds"] == 10
    assert "topicShifts" in payload
    assert "stats" in payload
    assert len(payload["stats"]) >= 1
