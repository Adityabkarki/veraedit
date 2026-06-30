"""
Unit tests for imagegen Ken Burns helper (Phase 02).

Run: pytest tests/unit/test_imagegen.py -v
"""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


def test_dimensions_for_aspect_defaults():
    from processors.imagegen import _dimensions_for_aspect

    assert _dimensions_for_aspect("9:16") == (1080, 1920)
    assert _dimensions_for_aspect("16:9") == (1920, 1080)


def test_image_path_to_video_builds_ffmpeg_command(monkeypatch, tmp_path):
    from processors import imagegen

    image = tmp_path / "frame.png"
    image.write_bytes(
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc"
        b"\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    out = tmp_path / "out.mp4"
    calls: list[list[str]] = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        out.write_bytes(b"fake-mp4")
        return type("R", (), {"returncode": 0})()

    monkeypatch.setattr(imagegen.subprocess, "run", fake_run)
    result = imagegen.image_path_to_video(image, out, duration=2.0, aspect_ratio="9:16")
    assert result == out
    assert calls
    assert "-vf" in calls[0]
    assert "zoompan" in calls[0][calls[0].index("-vf") + 1]
