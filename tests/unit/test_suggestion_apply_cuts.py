"""Tests for suggestion_apply cut logic."""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


def test_remove_time_ranges_splits_middle_cut():
    from tasks.suggestion_apply import _remove_time_ranges

    clips = [
        {
            "id": "main",
            "source_start": 0.0,
            "source_end": 116.0,
            "timeline_start": 0.0,
            "timeline_end": 116.0,
            "speed": 1.0,
        }
    ]
    result = _remove_time_ranges(clips, [(5.0, 10.0)])
    assert len(result) == 2
    assert result[0]["source_start"] == 0.0
    assert result[0]["source_end"] == 5.0
    assert result[0]["timeline_end"] == 5.0
    assert result[1]["source_start"] == 10.0
    assert result[1]["source_end"] == 116.0
    assert result[1]["timeline_start"] == 5.0
    assert result[1]["timeline_end"] == pytest.approx(111.0)


def test_apply_remove_filler_shortens_timeline():
    from tasks.suggestion_apply import apply_suggestion

    data = {
        "schema_version": 1,
        "tracks": [
            {
                "id": "track-video-1",
                "type": "video",
                "clips": [
                    {
                        "id": "c1",
                        "asset_id": "a",
                        "source_start": 0.0,
                        "source_end": 116.0,
                        "timeline_start": 0.0,
                        "timeline_end": 116.0,
                        "speed": 1.0,
                        "muted": False,
                        "volume": 1.0,
                        "effects": [],
                        "transitions": {},
                        "label": "",
                    }
                ],
            }
        ],
        "global_settings": {},
        "metadata": {},
    }
    result = apply_suggestion(
        {
            "action": "remove_filler",
            "filler_cuts": [{"start": 2.0, "end": 3.0}, {"start": 20.0, "end": 22.0}],
        },
        data,
    )
    video = result["tracks"][0]["clips"]
    total = sum(c["timeline_end"] - c["timeline_start"] for c in video)
    assert total == pytest.approx(113.0)
