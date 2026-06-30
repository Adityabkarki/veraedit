"""
Unit tests for template_renderer (Phase 06).
"""
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

from processors.template_renderer import (
    _storage_key,
    _text_window_in_assembled,
    render_video_from_template,
)


class TestTemplateRendererHelpers:
    def test_storage_key_accepts_snake_and_camel(self):
        assert _storage_key({"storage_key": "a/b.mp4"}) == "a/b.mp4"
        assert _storage_key({"storageKey": "c/d.mp4"}) == "c/d.mp4"

    def test_storage_key_missing_raises(self):
        with pytest.raises(ValueError, match="missing a storage key"):
            _storage_key({})

    def test_text_window_maps_to_concatenated_timeline(self):
        video_slots = [
            {"slot_id": "v1", "start": 0.0, "end": 5.0},
            {"slot_id": "v2", "start": 10.0, "end": 15.0},
        ]
        part_durations = [4.0, 3.0]
        text_slot = {"slot_id": "t1", "start": 11.0, "end": 12.5}
        window = _text_window_in_assembled(text_slot, video_slots, part_durations)
        assert window == pytest.approx((5.0, 6.5))


class TestTemplateRendererAssembly:
    def test_render_requires_resolved_assets(self, monkeypatch, tmp_path):
        from processors import template_renderer

        monkeypatch.setattr(
            template_renderer.storage_sync,
            "download_to_temp",
            lambda key, label: str(tmp_path / "asset.mp4"),
        )
        monkeypatch.setattr(
            template_renderer.subprocess,
            "run",
            MagicMock(),
        )
        (tmp_path / "asset.mp4").write_bytes(b"fake")

        template = {
            "slots": [
                {
                    "slot_id": "s1",
                    "type": "video_placeholder",
                    "start": 0.0,
                    "end": 3.0,
                }
            ]
        }

        with pytest.raises(ValueError, match="no resolved asset"):
            render_video_from_template(template, {}, {}, tmp_path / "work")

    def test_render_concatenates_parts(self, monkeypatch, tmp_path):
        from processors import template_renderer

        monkeypatch.setattr(
            template_renderer.storage_sync,
            "download_to_temp",
            lambda key, label: str(tmp_path / f"{label}.mp4"),
        )
        monkeypatch.setattr(template_renderer, "get_duration", lambda _p: 5.0)

        calls: list[list[str]] = []

        def fake_run(cmd, **kwargs):
            calls.append(cmd)
            out = Path(cmd[-2])
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(b"fake")

        monkeypatch.setattr(template_renderer.subprocess, "run", fake_run)

        for label in ("render_s1", "render_s2"):
            (tmp_path / f"{label}.mp4").write_bytes(b"fake")

        template = {
            "slots": [
                {"slot_id": "s1", "type": "video_placeholder", "start": 0.0, "end": 3.0},
                {"slot_id": "s2", "type": "image_placeholder", "start": 3.0, "end": 6.0},
            ]
        }
        resolved = {
            "s1": {"storage_key": "library/v1.mp4"},
            "s2": {"storage_key": "library/img.png"},
        }

        output = render_video_from_template(template, resolved, {}, tmp_path / "work")
        assert output.endswith("assembled.mp4")
        assert len(calls) >= 3

    def test_render_adds_background_music_from_audio_profile(self, monkeypatch, tmp_path):
        from processors import template_renderer

        monkeypatch.setattr(
            template_renderer.storage_sync,
            "download_to_temp",
            lambda key, label: str(tmp_path / f"{label}.mp4"),
        )
        monkeypatch.setattr(template_renderer, "get_duration", lambda _p: 5.0)

        music_track = tmp_path / "music.mp3"
        music_track.write_bytes(b"mp3")

        def fake_run(cmd, **kwargs):
            out = Path(cmd[-2])
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(b"fake")

        monkeypatch.setattr(template_renderer.subprocess, "run", fake_run)
        monkeypatch.setattr(
            template_renderer,
            "pick_music_for_audio_profile",
            lambda _profile: music_track,
        )
        monkeypatch.setattr(template_renderer, "should_duck_for_speech", lambda _p: True)
        music_called: list[bool] = []
        monkeypatch.setattr(
            template_renderer,
            "add_background_music",
            lambda video, music, output, **kw: (
                music_called.append(kw.get("duck_for_speech", False)),
                Path(output).write_bytes(b"final"),
                str(output),
            )[2],
        )

        (tmp_path / "render_s1.mp4").write_bytes(b"fake")

        template = {
            "slots": [
                {"slot_id": "s1", "type": "video_placeholder", "start": 0.0, "end": 3.0},
            ],
            "audio_profile": {
                "music_genre": "upbeat pop",
                "music_ducking_behavior": "music drops significantly under VO",
            },
        }
        resolved = {"s1": {"storage_key": "library/v1.mp4"}}

        output = render_video_from_template(template, resolved, {}, tmp_path / "work")
        assert output.endswith("with_music.mp4")
        assert music_called == [True]
