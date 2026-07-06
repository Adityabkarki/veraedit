"""Tests for Audio Multicam Engine."""
from services.director.signals.shot_classification import classify_shots
from services.multicam.sync import compute_sync_offset_frames, sync_camera_feeds


def test_shot_classification_labels_talking_head():
    segments = [
        {"text": "Welcome to the podcast episode today.", "start": 0, "end": 4},
        {"text": "Click this button on the screen.", "start": 5, "end": 8},
    ]
    shots = classify_shots(segments)
    assert len(shots) == 2
    assert shots[0]["shotType"] in ("wide", "medium", "close_up")
    assert shots[1]["shotType"] == "screen_recording"


def test_cross_correlation_finds_offset():
    ref = [0.0, 0.1, 0.5, 1.0, 0.5, 0.1, 0.0]
    feed = [0.0, 0.0, 0.0, 0.0, 0.1, 0.5, 1.0, 0.5, 0.1]
    offset = compute_sync_offset_frames(ref, feed, fps=30)
    assert 3 <= offset <= 4


def test_sync_camera_feeds_single_feed_noop():
    synced = sync_camera_feeds([{"id": "cam-a", "label": "Host", "rmsEnvelope": [1.0]}])
    assert synced[0]["syncOffsetFrames"] == 0


def test_sync_camera_feeds_two_feeds():
    feeds = [
        {"id": "a", "rmsEnvelope": [0, 1, 0, 1, 0]},
        {"id": "b", "rmsEnvelope": [0, 0, 0, 1, 0]},
    ]
    synced = sync_camera_feeds(feeds)
    assert len(synced) == 2
    assert synced[0]["syncOffsetFrames"] == 0
    assert isinstance(synced[1]["syncOffsetFrames"], int)


def test_extract_signals_includes_shot_classifications():
    from services.director.extract_signals import extract_director_signals

    payload = extract_director_signals(
        segments=[{"text": "Hello podcast", "start": 0, "end": 2}],
        duration_seconds=2,
    )
    assert "shotClassifications" in payload
    assert len(payload["shotClassifications"]) >= 1
