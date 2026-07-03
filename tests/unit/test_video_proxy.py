"""Unit tests for edit proxy ingest pipeline."""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from models.asset import MediaType, ProxyStatus
from processors.video_proxy import (
    build_proxy_ffmpeg_command,
    build_proxy_scale_filter,
    proxy_storage_key_for,
)
from services.asset_media import playback_storage_key, should_generate_proxy, source_storage_key


def test_proxy_storage_key_path():
    key = proxy_storage_key_for("proj-1", "asset-1")
    assert key == "projects/proj-1/assets/asset-1/proxy/edit.mp4"


def test_build_proxy_scale_filter_540p():
    filt = build_proxy_scale_filter(540)
    assert "540" in filt
    assert "force_original_aspect_ratio=decrease" in filt


def test_build_proxy_ffmpeg_command_uses_h264_and_faststart():
    cmd = build_proxy_ffmpeg_command(Path("C:/in/video.mp4"), Path("C:/out/proxy.mp4"))
    joined = " ".join(cmd)
    assert "libx264" in joined
    assert "faststart" in joined
    assert "-crf" in joined


def test_playback_uses_proxy_when_ready():
    asset = SimpleNamespace(
        storage_key="projects/p/assets/a/original.mp4",
        proxy_storage_key="projects/p/assets/a/proxy/edit.mp4",
        proxy_status=ProxyStatus.READY,
        media_type=MediaType.VIDEO,
    )
    assert playback_storage_key(asset) == asset.proxy_storage_key
    assert source_storage_key(asset) == asset.storage_key


def test_playback_falls_back_to_original_while_pending():
    asset = SimpleNamespace(
        storage_key="projects/p/assets/a/original.mp4",
        proxy_storage_key=None,
        proxy_status=ProxyStatus.PROCESSING,
        media_type=MediaType.VIDEO,
    )
    assert playback_storage_key(asset) == asset.storage_key


def test_should_generate_proxy_only_for_video():
    video = SimpleNamespace(media_type=MediaType.VIDEO)
    audio = SimpleNamespace(media_type=MediaType.AUDIO)
    assert should_generate_proxy(video) is True
    assert should_generate_proxy(audio) is False


@patch("processors.video_proxy.subprocess.run")
@patch("processors.downloader.extract_metadata")
@patch("processors.video_proxy._find_ffmpeg")
def test_create_edit_proxy_success(mock_ffmpeg, mock_meta, mock_run, tmp_path):
    from processors.video_proxy import create_edit_proxy

    mock_ffmpeg.return_value = Path("ffmpeg")
    mock_run.return_value = MagicMock(returncode=0, stderr="")
    mock_meta.return_value = {"width": 960, "height": 540, "duration": 60.0}

    src = tmp_path / "big.mp4"
    src.write_bytes(b"x" * 1000)
    out = tmp_path / "proxy.mp4"
    out.write_bytes(b"y" * 200)

    meta = create_edit_proxy(src, out)
    assert meta["file_size"] == 200
    assert meta["width"] == 960
    mock_run.assert_called_once()
