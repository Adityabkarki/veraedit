"""
ViraEdit — Image to video conversion for generated gap fillers (Phase 02).
"""
from __future__ import annotations

import subprocess
from pathlib import Path

import structlog

from config import settings

log = structlog.get_logger("viraedit.imagegen")

_ASPECT_DIMENSIONS: dict[str, tuple[int, int]] = {
    "16:9": (1920, 1080),
    "9:16": (1080, 1920),
    "1:1": (1080, 1080),
    "4:3": (1440, 1080),
}


def _dimensions_for_aspect(aspect_ratio: str) -> tuple[int, int]:
    return _ASPECT_DIMENSIONS.get(aspect_ratio, (1080, 1920))


def image_path_to_video(
    image_path: Path,
    output_path: Path,
    *,
    duration: float = 4.0,
    fps: int = 30,
    aspect_ratio: str = "9:16",
    animation: str = "ken_burns",
) -> Path:
    """Convert a still image to a short video segment with optional animation."""
    width, height = _dimensions_for_aspect(aspect_ratio)
    frames = max(int(fps * duration), 1)

    if animation == "static":
        filter_str = (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2"
        )
    elif animation == "zoom_in":
        filter_str = (
            f"scale=8000:-1,"
            f"zoompan=z='min(zoom+0.0005,1.1)':d={frames}:"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={width}x{height}"
        )
    else:
        filter_str = (
            f"scale=8000:-1,"
            f"zoompan=z='if(lte(zoom,1.0),1.05,max(1.001,zoom-0.001))':"
            f"d={frames}:"
            f"x='iw/2-(iw/zoom/2)':y='ih/4-(ih/zoom/4)':s={width}x{height}"
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        settings.FFMPEG_PATH,
        "-loop", "1",
        "-i", image_path.as_posix(),
        "-vf", filter_str,
        "-c:v", "libx264",
        "-t", str(duration),
        "-pix_fmt", "yuv420p",
        "-r", str(fps),
        output_path.as_posix(),
        "-y",
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        log.error("image_to_video_failed", stderr=exc.stderr)
        raise RuntimeError("Could not convert the generated image to video.") from exc

    return output_path
