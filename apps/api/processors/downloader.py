"""
ViraEdit — Video downloader for ingestion (Module 01).

Downloads source videos from URLs via yt-dlp and extracts metadata via ffprobe.
"""
from __future__ import annotations

import json
import subprocess
import tempfile
from fractions import Fraction
from pathlib import Path

import structlog

from config import settings

log = structlog.get_logger("viraedit.processors.downloader")


def _temp_job_dir(job_id: str) -> Path:
    out_dir = Path(tempfile.gettempdir()) / "viraedit" / job_id
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir


def download_video(url: str, job_id: str) -> Path:
    """
    Download a video from a public URL to a temp file.

    Returns:
        Path to the downloaded MP4 file.
    """
    try:
        import yt_dlp
    except ImportError as exc:
        raise RuntimeError(
            "yt-dlp is not installed. Run: pip install yt-dlp"
        ) from exc

    out_dir = _temp_job_dir(job_id)
    out_path = out_dir / "raw.mp4"
    ffmpeg_path = Path(settings.FFMPEG_PATH)
    ffmpeg_dir = str(ffmpeg_path.parent) if ffmpeg_path.parent != Path(".") else None

    ydl_opts: dict = {
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "merge_output_format": "mp4",
        "outtmpl": out_path.as_posix(),
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "playlistend": 1,
    }
    if ffmpeg_dir:
        ydl_opts["ffmpeg_location"] = ffmpeg_dir

    log.info("ingest_download_started", job_id=job_id, url=url)
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    if not out_path.exists():
        candidates = sorted(
            out_dir.glob("raw.*"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if candidates:
            out_path = candidates[0]
        else:
            raise RuntimeError("Download finished but the video file was not found.")

    log.info("ingest_download_complete", job_id=job_id, path=str(out_path))
    return out_path


def parse_frame_rate(value: str | None) -> float:
    """Parse ffprobe r_frame_rate (e.g. '30000/1001') to a float fps."""
    if not value:
        return 30.0
    try:
        if "/" in value:
            return float(Fraction(value))
        return float(value)
    except (ValueError, ZeroDivisionError):
        return 30.0


def extract_metadata(video_path: Path) -> dict:
    """
    Extract duration, resolution, codec, and audio presence via ffprobe.
    """
    cmd = [
        settings.FFPROBE_PATH,
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_streams",
        "-show_format",
        video_path.as_posix(),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    data = json.loads(result.stdout)
    streams = data.get("streams") or []
    vs = next((s for s in streams if s.get("codec_type") == "video"), {})
    fmt = data.get("format") or {}

    return {
        "duration": float(fmt.get("duration", 0) or 0),
        "width": int(vs.get("width", 0) or 0),
        "height": int(vs.get("height", 0) or 0),
        "fps": parse_frame_rate(vs.get("r_frame_rate")),
        "codec": vs.get("codec_name", ""),
        "file_size": int(fmt.get("size", 0) or 0),
        "has_audio": any(s.get("codec_type") == "audio" for s in streams),
    }


def generate_thumbnail(
    video_path: Path,
    job_id: str,
    at_second: float = 2.0,
) -> Path:
    """Extract a single JPEG frame for preview thumbnails."""
    out_dir = _temp_job_dir(job_id)
    thumb_path = out_dir / "thumb.jpg"
    subprocess.run(
        [
            settings.FFMPEG_PATH,
            "-ss",
            str(at_second),
            "-i",
            video_path.as_posix(),
            "-frames:v",
            "1",
            "-q:v",
            "2",
            thumb_path.as_posix(),
            "-y",
        ],
        check=True,
        capture_output=True,
    )
    return thumb_path
