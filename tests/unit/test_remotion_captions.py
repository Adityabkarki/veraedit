"""
Unit tests for Remotion caption rendering (Phase 09).
"""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


@pytest.mark.asyncio
async def test_render_captions_v2_falls_back_to_ass(monkeypatch, tmp_path):
    from processors import caption_renderer

    inp = tmp_path / "in.mp4"
    out = tmp_path / "out.mp4"
    inp.write_bytes(b"video")

    async def _fail_overlay(*_a, **_k):
        raise RuntimeError("Remotion service unreachable")

    def _fake_ass(i, o, words, style="hormozi"):
        Path(o).write_bytes(b"ass-output")
        return str(o)

    monkeypatch.setattr(
        "processors.remotion_client.render_caption_overlay",
        _fail_overlay,
    )
    monkeypatch.setattr(caption_renderer, "render_captions", _fake_ass)
    monkeypatch.setattr("processors.text_editor.get_duration", lambda _p: 10.0)

    result = await caption_renderer.render_captions_v2(
        inp,
        out,
        [{"word": "hello", "start": 0.0, "end": 0.5}],
        style="minimal",
    )
    assert result == str(out)
    assert out.read_bytes() == b"ass-output"


@pytest.mark.asyncio
async def test_render_captions_v2_skips_remotion_for_long_videos(monkeypatch, tmp_path):
    from processors import caption_renderer

    inp = tmp_path / "in.mp4"
    out = tmp_path / "out.mp4"
    inp.write_bytes(b"video")

    remotion_called = False

    async def _should_not_run(*_a, **_k):
        nonlocal remotion_called
        remotion_called = True
        raise AssertionError("Remotion should not run for long videos")

    def _fake_ass(i, o, words, style="hormozi"):
        Path(o).write_bytes(b"ass-long")
        return str(o)

    monkeypatch.setattr(
        "processors.remotion_client.render_caption_overlay",
        _should_not_run,
    )
    monkeypatch.setattr(caption_renderer, "render_captions", _fake_ass)
    monkeypatch.setattr("processors.text_editor.get_duration", lambda _p: 300.0)

    result = await caption_renderer.render_captions_v2(
        inp,
        out,
        [{"word": "hello", "start": 0.0, "end": 0.5}],
        style="minimal",
    )
    assert result == str(out)
    assert remotion_called is False
    assert out.read_bytes() == b"ass-long"


def test_composite_overlay_ffmpeg_command(monkeypatch, tmp_path):
    from processors.remotion_client import composite_overlay_onto_video

    base = tmp_path / "base.mp4"
    overlay = tmp_path / "overlay.webm"
    out = tmp_path / "final.mp4"
    base.write_bytes(b"b")
    overlay.write_bytes(b"o")

    captured: list[list[str]] = []

    def fake_run(cmd, **kwargs):
        captured.append(cmd)
        out.write_bytes(b"done")

    monkeypatch.setattr("processors.remotion_client.subprocess.run", fake_run)

    composite_overlay_onto_video(base, overlay, out)
    assert captured
    assert any("overlay=0:0:format=auto" in str(arg) for arg in captured[0])


@pytest.mark.asyncio
async def test_remotion_service_healthy_false_when_down(monkeypatch):
    from processors import remotion_client

    async def _fail_get(*_a, **_k):
        raise ConnectionError("refused")

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            pass

        get = _fail_get

    monkeypatch.setattr(remotion_client.httpx, "AsyncClient", FakeClient)
    assert await remotion_client.remotion_service_healthy() is False


def test_font_by_style_includes_nepali():
    from processors.remotion_client import FONT_BY_STYLE

    assert FONT_BY_STYLE["nepali_bold"] == "Noto Sans Devanagari"
