"""Tests for automatic multicam feed sync."""
from services.multicam.sync import sync_camera_feeds


def test_project_feed_sync_shape():
    feeds = [
        {"id": "a", "rmsEnvelope": [0, 1, 0, 1, 0]},
        {"id": "b", "rmsEnvelope": [0, 0, 0, 1, 0]},
    ]
    synced = sync_camera_feeds(feeds)
    payload = [
        {
            "id": feed["id"],
            "label": feed.get("label", ""),
            "sourceUrl": feed["id"],
            "syncOffsetFrames": feed["syncOffsetFrames"],
            "speakerId": "A",
        }
        for feed in synced
    ]
    assert len(payload) == 2
    assert payload[0]["syncOffsetFrames"] == 0
    assert isinstance(payload[1]["syncOffsetFrames"], int)
