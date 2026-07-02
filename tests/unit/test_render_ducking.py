"""Render pipeline ducking helpers (Phase 10 Part 3)."""
from __future__ import annotations

import pathlib
import sys
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "apps" / "api"))

from tasks.render_task import _mix_audio_with_ducking, _music_clip_needs_ducking


def test_music_clip_needs_ducking_reads_effect_param():
    clip = {
        "effects": [{
            "type": "music_bed",
            "params": {"duck_under_voice": True},
        }],
    }
    assert _music_clip_needs_ducking(clip) is True


def test_mix_audio_with_ducking_uses_sidechain_filter():
    captured: dict = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd

    with patch("subprocess.run", fake_run):
        _mix_audio_with_ducking(
            pathlib.Path("/tmp/voice.mp4"),
            pathlib.Path("/tmp/music.wav"),
            pathlib.Path("/tmp/out.mp4"),
            music_volume=0.2,
        )

    filter_idx = captured["cmd"].index("-filter_complex") + 1
    filt = captured["cmd"][filter_idx]
    assert "sidechaincompress" in filt
    assert "volume=0.2" in filt
