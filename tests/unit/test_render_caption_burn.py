"""Tests for caption burn-in during FFmpeg export."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


def test_caption_words_from_timeline_reads_caption_track():
    from tasks.render_task import _caption_words_from_timeline

    timeline = {
        "tracks": [
            {
                "type": "captions",
                "clips": [
                    {
                        "timeline_start": 1.0,
                        "timeline_end": 3.0,
                        "label": "ignored",
                        "effects": [
                            {"type": "caption", "params": {"text": "नमस्ते"}},
                        ],
                    },
                    {
                        "timeline_start": 4.0,
                        "timeline_end": 6.5,
                        "label": "Second line",
                        "effects": [],
                    },
                ],
            }
        ]
    }
    words = _caption_words_from_timeline(timeline)
    assert len(words) == 2
    assert words[0]["word"] == "नमस्ते"
    assert words[0]["start"] == 1.0
    assert words[1]["word"] == "Second line"


def test_resolve_caption_burn_style_from_metadata():
    from tasks.render_task import _resolve_caption_burn_style

    assert _resolve_caption_burn_style(
        {"metadata": {"caption_burn_style": "mrbeast"}}
    ) == "mrbeast"
    assert _resolve_caption_burn_style(
        {"metadata": {"caption_editor_preset": "tiktok"}}
    ) == "mrbeast"
    assert _resolve_caption_burn_style(
        {"metadata": {"caption_editor_preset": "subtitle"}}
    ) == "minimal"


def test_maybe_burn_skips_when_no_captions(tmp_path, monkeypatch):
    from tasks import render_task

    inp = tmp_path / "in.mp4"
    inp.write_bytes(b"fake")
    monkeypatch.setattr(render_task, "_ffprobe_duration", lambda _p: 10.0)

    out, dur = render_task._maybe_burn_timeline_captions(
        inp,
        {"tracks": []},
        tmp_path,
        "job-1",
    )
    assert out == inp
    assert dur == 10.0


def test_maybe_burn_calls_render_captions(tmp_path, monkeypatch):
    from tasks import render_task

    inp = tmp_path / "in.mp4"
    inp.write_bytes(b"fake")
    calls: list[dict] = []

    def fake_render(i, o, words, style="hormozi"):
        calls.append({"style": style, "words": words, "out": str(o)})
        from pathlib import Path
        Path(o).write_bytes(b"burned")

    monkeypatch.setattr(
        "processors.caption_renderer.render_captions",
        fake_render,
    )
    monkeypatch.setattr(render_task, "_ffprobe_duration", lambda _p: 12.0)
    monkeypatch.setattr(render_task, "_update_render_status", lambda *a, **k: None)

    timeline = {
        "metadata": {"caption_burn_style": "nepali_bold"},
        "tracks": [
            {
                "type": "captions",
                "clips": [
                    {
                        "timeline_start": 0.0,
                        "timeline_end": 2.0,
                        "label": "Hello",
                        "effects": [],
                    }
                ],
            }
        ],
    }

    out, dur = render_task._maybe_burn_timeline_captions(
        inp, timeline, tmp_path, "job-2"
    )
    assert calls
    assert calls[0]["style"] == "nepali_bold"
    assert out.name == "captioned_export.mp4"
    assert dur == 12.0
