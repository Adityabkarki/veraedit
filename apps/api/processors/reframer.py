"""
ViraEdit — Platform reframe and export helpers (Phase 03).
"""
from __future__ import annotations

import subprocess
from pathlib import Path

from config import settings
from processors.text_editor import get_duration
from tasks.shorts_engine import short_crop_filter

PLATFORM_SPECS: dict[str, dict] = {
    "tiktok": {"width": 1080, "height": 1920, "max_duration": 60},
    "instagram_reels": {"width": 1080, "height": 1920, "max_duration": 90},
    "youtube_shorts": {"width": 1080, "height": 1920, "max_duration": 60},
    "facebook_reels": {"width": 1080, "height": 1920, "max_duration": 90},
    "facebook_feed": {"width": 1080, "height": 1080, "max_duration": 120},
}


def reframe_video(
    input_path: str | Path,
    output_path: str | Path,
    width: int = 1080,
    height: int = 1920,
    mode: str = "face_track",
) -> str:
    """Reframe horizontal video to vertical using center crop + scale."""
    in_path = Path(input_path)
    out_path = Path(output_path)
    pan_x = 0.5 if mode == "face_track" else 0.5
    vf = short_crop_filter(pan_x, width, height)

    subprocess.run(
        [
            settings.FFMPEG_PATH,
            "-i", in_path.as_posix(),
            "-vf", vf,
            "-c:a", "copy",
            out_path.as_posix(),
            "-y",
        ],
        check=True,
        capture_output=True,
    )
    return out_path.as_posix()


def export_for_platform(
    input_path: str | Path,
    output_path: str | Path,
    platform: str,
) -> str:
    """Export a clip capped to platform duration/resolution."""
    in_path = Path(input_path)
    out_path = Path(output_path)
    spec = PLATFORM_SPECS.get(platform, PLATFORM_SPECS["tiktok"])
    max_dur = float(spec["max_duration"])
    width = int(spec["width"])
    height = int(spec["height"])

    duration = get_duration(in_path)
    trim_args: list[str] = []
    if duration > max_dur + 0.1:
        trim_args = ["-t", str(max_dur)]

    if platform == "facebook_feed":
        vf = f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2"
    else:
        vf = f"scale={width}:{height},setsar=1"

    cmd = [
        settings.FFMPEG_PATH,
        "-i", in_path.as_posix(),
        *trim_args,
        "-vf", vf,
        "-c:a", "aac",
        "-b:a", "128k",
        out_path.as_posix(),
        "-y",
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return out_path.as_posix()
