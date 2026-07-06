"""Tests for Director timeline override helpers."""
from services.director.overrides import delete_timeline_entry, promote_trigger


def _sample_timeline():
    return {
        "triggers": [
            {
                "id": "t1",
                "type": "stat_mention",
                "status": "realized",
                "resultingEntryId": "entry-t1",
                "transcriptStart": 1,
                "transcriptEnd": 3,
            },
            {
                "id": "t2",
                "type": "topic_shift",
                "status": "suppressed",
                "transcriptStart": 5,
                "transcriptEnd": 7,
                "metadata": {"componentId": "metric_ticker"},
            },
        ],
        "tracks": {
            "motionGraphics": [
                {"id": "entry-t1", "componentId": "metric_ticker", "triggerId": "t1"},
            ],
            "broll": [],
        },
        "fps": 30,
    }


def test_delete_timeline_entry_suppresses_trigger():
    out = delete_timeline_entry(_sample_timeline(), "entry-t1")
    assert out["tracks"]["motionGraphics"] == []
    t1 = next(t for t in out["triggers"] if t["id"] == "t1")
    assert t1["status"] == "suppressed"
    assert t1.get("resultingEntryId") is None


def test_promote_trigger_adds_motion_graphic():
    out = promote_trigger(_sample_timeline(), "t2")
    assert len(out["tracks"]["motionGraphics"]) == 2
    t2 = next(t for t in out["triggers"] if t["id"] == "t2")
    assert t2["status"] == "realized"
    assert t2["resultingEntryId"]
