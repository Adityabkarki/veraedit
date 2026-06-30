"""
Unit tests for sizzle_assembler and music_library (Phase 05).
"""
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

from processors.music_library import MUSIC_LIBRARY, pick_music_for_mood
from processors.sizzle_assembler import build_music_filter


class TestSizzleAssembler:
    def test_music_filter_uses_sidechain_when_ducking(self):
        filt = build_music_filter(duck_for_speech=True)
        assert "sidechaincompress" in filt
        assert "amix=inputs=2" in filt

    def test_music_filter_flat_mix_without_ducking(self):
        filt = build_music_filter(duck_for_speech=False, music_volume=0.25)
        assert "sidechaincompress" not in filt
        assert "volume=0.25" in filt

    def test_assemble_calls_ffmpeg_per_fragment(self, monkeypatch, tmp_path):
        from processors import sizzle_assembler

        calls: list[list[str]] = []

        def fake_run(cmd, **kwargs):
            calls.append(cmd)
            out = Path(cmd[-2])
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(b"fake")

        monkeypatch.setattr(sizzle_assembler.subprocess, "run", fake_run)

        source = tmp_path / "source.mp4"
        source.write_bytes(b"vid")
        output = tmp_path / "out" / "sizzle.mp4"
        fragments = [
            {"start": 0.0, "end": 2.0},
            {"start": 10.0, "end": 12.5},
        ]

        result = sizzle_assembler.assemble_sizzle_reel(source, fragments, output)
        assert result == output.as_posix()
        assert len(calls) == 3  # 2 cuts + 1 concat
        assert any("-f" in cmd and "concat" in cmd for cmd in calls)


class TestMusicLibrary:
    def test_pick_music_returns_existing_bundled_track(self):
        path = pick_music_for_mood("upbeat")
        assert path.suffix == ".mp3"
        assert path.name in MUSIC_LIBRARY["upbeat"]

    def test_unknown_mood_falls_back_to_upbeat_pool(self):
        path = pick_music_for_mood("unknown_mood")
        assert path.name in MUSIC_LIBRARY["upbeat"]
