"""
ViraEdit — Edit proxy generation (lightweight H.264 for editor playback).

Creates a smaller MP4 from the original upload. The original is kept untouched
for export/render at full quality.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

import structlog

from config import settings
from tasks.audio import _find_ffmpeg

log = structlog.get_logger("viraedit.processors.video_proxy")


def proxy_storage_key_for(project_id: str, asset_id: str) -> str:
    return f"projects/{project_id}/assets/{asset_id}/proxy/edit.mp4"


def build_proxy_scale_filter(max_height: int) -> str:
    """Scale down to max_height (even width), never upscale."""
    return (
        f"scale=-2:'min({max_height},ih)':force_original_aspect_ratio=decrease,"
        "format=yuv420p"
    )


def build_proxy_ffmpeg_command(input_path: Path, output_path: Path) -> list[str]:
    ffmpeg = _find_ffmpeg()
    max_h = settings.PROXY_MAX_HEIGHT
    crf = settings.PROXY_CRF
    preset = settings.PROXY_PRESET
    audio_br = settings.PROXY_AUDIO_BITRATE
    vf = build_proxy_scale_filter(max_h)

    return [
        str(ffmpeg),
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        input_path.as_posix(),
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-crf",
        str(crf),
        "-preset",
        preset,
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        audio_br,
        "-movflags",
        "+faststart",
        "-y",
        output_path.as_posix(),
    ]


def create_edit_proxy(input_path: Path, output_path: Path) -> dict:
    """
    Transcode source video to a compact edit proxy.

    Returns metadata: {width, height, file_size, max_height, crf}.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = build_proxy_ffmpeg_command(input_path, output_path)

    log.info(
        "edit_proxy_starting",
        input=input_path.name,
        output=output_path.name,
        max_height=settings.PROXY_MAX_HEIGHT,
        crf=settings.PROXY_CRF,
    )

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=settings.PROXY_TRANSCODE_TIMEOUT_SECONDS,
    )
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()[-500:]
        raise RuntimeError(f"Edit proxy transcode failed: {stderr or 'unknown FFmpeg error'}")

    if not output_path.exists():
        raise RuntimeError("Edit proxy transcode produced no output file.")

    from processors.downloader import extract_metadata

    meta = extract_metadata(output_path)
    file_size = output_path.stat().st_size

    log.info(
        "edit_proxy_complete",
        output=output_path.name,
        size_mb=round(file_size / (1024 * 1024), 2),
        width=meta.get("width"),
        height=meta.get("height"),
    )

    return {
        **meta,
        "file_size": file_size,
        "proxy_max_height": settings.PROXY_MAX_HEIGHT,
        "proxy_crf": settings.PROXY_CRF,
    }
