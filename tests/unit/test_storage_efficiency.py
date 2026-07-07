"""Tests for Phase 13 binary audio analysis and timeline windowing."""
from __future__ import annotations

from processors.audio_analysis_binary import (
    binary_payload_ratio,
    decode_analysis_track_bytes,
    encode_analysis_track,
    decode_sidecar_payload,
)
from services.director.timeline_window import (
    build_windowed_timeline,
    entry_frame_range,
    paginate_triggers,
)


def _sample_track(frame_count: int = 100, band_count: int = 8) -> dict:
    frames = []
    for i in range(frame_count):
        frames.append(
            {
                "frame": i,
                "overallAmplitude": (i % 10) / 10.0,
                "bands": [(i + b) % 256 / 255.0 for b in range(band_count)],
                "isTransient": i % 17 == 0,
            }
        )
    return {
        "schemaVersion": 1,
        "sourceHash": "abc123",
        "fps": 30,
        "bandCount": band_count,
        "frames": frames,
        "peakAmplitude": 1.0,
        "meta": {"analysisPath": "server_librosa", "generatedAt": "2026-01-01"},
    }


def test_encode_decode_roundtrip():
    track = _sample_track(60, 4)
    encoded = encode_analysis_track(track)
    decoded = decode_analysis_track_bytes(
        encoded,
        source_hash="abc123",
        meta=track["meta"],
    )
    assert decoded is not None
    assert len(decoded["frames"]) == 60
    assert decoded["frames"][0]["overallAmplitude"] == track["frames"][0]["overallAmplitude"]
    assert decoded["frames"][5]["isTransient"] == track["frames"][5]["isTransient"]
    assert len(decoded["frames"][0]["bands"]) == 4


def test_binary_smaller_than_json():
    track = _sample_track(3000, 16)
    json_size, binary_size = binary_payload_ratio(track)
    assert binary_size < json_size * 0.5


def test_decode_legacy_json_sidecar():
    track = _sample_track(5, 2)
    import json

    raw = json.dumps(track).encode("utf-8")
    decoded = decode_sidecar_payload(raw, source_hash="abc123")
    assert decoded is not None
    assert len(decoded["frames"]) == 5


def test_build_windowed_timeline_filters_entries():
    timeline = {
        "schemaVersion": 1,
        "projectId": "p1",
        "contentType": "podcast",
        "fps": 30,
        "durationInFrames": 9000,
        "width": 1920,
        "height": 1080,
        "theme": {},
        "tracks": {
            "video": [
                {"id": "v1", "startFrame": 0, "durationInFrames": 300},
                {"id": "v2", "startFrame": 600, "durationInFrames": 300},
            ],
            "audio": [],
            "captions": [],
            "broll": [],
            "motionGraphics": [],
            "transitions": [],
            "vfx": [],
            "sfx": [],
            "multicam": [],
        },
        "triggers": [
            {"id": "t1", "transcriptStart": 0, "transcriptEnd": 5, "status": "realized"},
            {"id": "t2", "transcriptStart": 25, "transcriptEnd": 30, "status": "realized"},
        ],
    }
    window = build_windowed_timeline(timeline, 0, 450)
    assert len(window["tracks"]["video"]) == 1
    assert window["tracks"]["video"][0]["id"] == "v1"
    assert len(window["triggers"]) == 1


def test_paginate_triggers():
    timeline = {
        "triggers": [
            {"id": f"t{i}", "transcriptStart": float(i), "status": "realized"}
            for i in range(120)
        ]
    }
    page1 = paginate_triggers(timeline, cursor=0, limit=50, status="realized")
    assert len(page1["triggers"]) == 50
    assert page1["hasMore"] is True
    page2 = paginate_triggers(timeline, cursor=50, limit=50, status="realized")
    assert page2["triggers"][0]["id"] == "t50"


def test_entry_frame_range_transition():
    start, end = entry_frame_range(
        "transitions",
        {"id": "tr1", "atFrame": 100, "durationInFrames": 20},
    )
    assert start == 100
    assert end == 120
