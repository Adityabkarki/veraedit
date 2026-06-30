"""
Unit tests for Phase 08 reliability hardening.
"""
import os
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


def test_devanagari_language_warning_flags_english_text():
    from processors.transcriber import _devanagari_language_warning

    warning = _devanagari_language_warning("Hello this is mostly English speech", "ne")
    assert warning is not None
    assert "non-Nepali" in warning


def test_devanagari_language_warning_ok_for_nepali():
    from processors.transcriber import _devanagari_language_warning

    text = "नमस्ते यो नेपाली भाषामा छ"
    assert _devanagari_language_warning(text, "ne") is None


def test_devanagari_language_warning_skipped_for_english():
    from processors.transcriber import _devanagari_language_warning

    assert _devanagari_language_warning("hello", "en") is None


def test_apply_cuts_precise_uses_reencode_codec(monkeypatch, tmp_path):
    from processors import text_editor

    inp = tmp_path / "in.mp4"
    out = tmp_path / "out.mp4"
    inp.write_bytes(b"x")

    calls: list[list[str]] = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        if "-ss" in cmd:
            part_idx = cmd.index("-to") + 1
            part_path = cmd[part_idx + 2]
            Path(part_path).write_bytes(b"part")
        else:
            out.write_bytes(b"done")
        class R:
            returncode = 0
            stdout = ""
            stderr = ""
        return R()

    monkeypatch.setattr(text_editor, "get_duration", lambda _p: 10.0)
    monkeypatch.setattr(text_editor.subprocess, "run", fake_run)

    text_editor.apply_cuts_precise(
        inp,
        out,
        [{"start": 2.0, "end": 4.0}],
        force_reencode=True,
    )

    segment_cmd = next(c for c in calls if "-ss" in c)
    assert "libx264" in segment_cmd


def test_downloader_maps_private_error(monkeypatch):
    class DownloadError(Exception):
        pass

    class FakeYDL:
        def __init__(self, opts):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            pass

        def download(self, urls):
            raise DownloadError("Video is private")

    fake_yt_dlp = types.SimpleNamespace(
        YoutubeDL=FakeYDL,
        utils=types.SimpleNamespace(DownloadError=DownloadError),
    )
    monkeypatch.setitem(sys.modules, "yt_dlp", fake_yt_dlp)

    from processors.downloader import download_video

    with pytest.raises(ValueError, match="private"):
        download_video("https://example.com/v", "job1")


@pytest.mark.asyncio
async def test_call_with_local_fallback_raises_clear_error():
    from services.ai_fallback import call_with_local_fallback

    async def primary():
        return None

    async def fallback():
        raise ValueError("bad json")

    with pytest.raises(RuntimeError, match="chapter detection|Couldn't complete"):
        await call_with_local_fallback(
            primary,
            fallback,
            action_name="chapter detection",
        )


def test_reframe_center_crop_mode_returns_no_warning(monkeypatch, tmp_path):
    from processors import reframer

    inp = tmp_path / "in.mp4"
    out = tmp_path / "out.mp4"
    inp.write_bytes(b"x")

    monkeypatch.setattr(
        reframer,
        "_center_crop_reframe",
        lambda i, o, w, h: out.write_bytes(b"ok") or out.as_posix(),
    )

    path, warning = reframer.reframe_video(inp, out, mode="center")
    assert warning is None
    assert Path(path).exists()


def test_reframe_face_track_import_error_falls_back(monkeypatch, tmp_path):
    from processors import reframer

    inp = tmp_path / "in.mp4"
    out = tmp_path / "out.mp4"
    inp.write_bytes(b"x")

    def boom(*a, **k):
        raise ImportError("no mediapipe")

    monkeypatch.setattr(reframer, "_face_track_reframe", boom)
    monkeypatch.setattr(
        reframer,
        "_center_crop_reframe",
        lambda i, o, w, h: out.write_bytes(b"ok") or out.as_posix(),
    )

    _path, warning = reframer.reframe_video(inp, out, mode="face_track")
    assert warning == "face_tracking_unavailable_used_center_crop"
