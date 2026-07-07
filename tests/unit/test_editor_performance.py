"""Tests for Phase 15 editor performance helpers."""
from __future__ import annotations

from processors.audio_analysis_binary import decode_sidecar_payload, encode_analysis_track


def test_binary_waveform_decode_roundtrip():
    track = {
        "sourceHash": "abc123",
        "fps": 30,
        "bandCount": 4,
        "peakAmplitude": 1.0,
        "frames": [
            {
                "frame": i,
                "overallAmplitude": i / 10,
                "bands": [0.1, 0.2, 0.3, 0.4],
                "isTransient": False,
            }
            for i in range(20)
        ],
    }
    raw = encode_analysis_track(track)
    decoded = decode_sidecar_payload(raw, source_hash="abc123")
    assert decoded is not None
    assert len(decoded["frames"]) == 20
