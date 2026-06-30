"""
ViraEdit — Sizzle reel assembly (Phase 05).

Cuts short fragments and concatenates into a fast-paced montage with optional music.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

from config import settings


def assemble_sizzle_reel(
    source_video_path: str | Path,
    fragments: list[dict],
    output_path: str | Path,
    *,
    target_width: int = 1080,
    target_height: int = 1920,
) -> str:
    """Cut and concatenate short fragments into one vertical montage."""
    source = Path(source_video_path)
    output = Path(output_path)
    work_dir = output.parent
    work_dir.mkdir(parents=True, exist_ok=True)
    part_paths: list[Path] = []

    scale_crop = (
        f"scale={target_width}:{target_height}:force_original_aspect_ratio=increase,"
        f"crop={target_width}:{target_height}"
    )

    for i, frag in enumerate(fragments):
        part_path = work_dir / f"sizzle_part_{i}.mp4"
        subprocess.run(
            [
                settings.FFMPEG_PATH,
                "-i", source.as_posix(),
                "-ss", str(frag["start"]),
                "-to", str(frag["end"]),
                "-vf", scale_crop,
                "-c:v", "libx264",
                "-preset", "fast",
                "-c:a", "aac",
                part_path.as_posix(),
                "-y",
            ],
            check=True,
            capture_output=True,
        )
        part_paths.append(part_path)

    concat_file = work_dir / "sizzle_concat.txt"
    with concat_file.open("w", encoding="utf-8") as handle:
        for part in part_paths:
            handle.write(f"file '{part.as_posix()}'\n")

    subprocess.run(
        [
            settings.FFMPEG_PATH,
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file.as_posix(),
            "-c", "copy",
            output.as_posix(),
            "-y",
        ],
        check=True,
        capture_output=True,
    )

    for part in part_paths:
        if part.exists():
            part.unlink()
    if concat_file.exists():
        concat_file.unlink()

    return output.as_posix()


def add_background_music(
    video_path: str | Path,
    music_path: str | Path,
    output_path: str | Path,
    *,
    music_volume: float = 0.3,
    duck_for_speech: bool = True,
) -> str:
    """Mix background music under sizzle audio with optional speech ducking."""
    video = Path(video_path)
    music = Path(music_path)
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    if duck_for_speech:
        filter_complex = (
            f"[1:a]volume={music_volume}[music];"
            f"[0:a][music]sidechaincompress=threshold=0.05:ratio=8:attack=5:release=200[ducked];"
            f"[0:a][ducked]amix=inputs=2:duration=first[aout]"
        )
    else:
        filter_complex = (
            f"[1:a]volume={music_volume}[music];"
            f"[0:a][music]amix=inputs=2:duration=first[aout]"
        )

    subprocess.run(
        [
            settings.FFMPEG_PATH,
            "-i", video.as_posix(),
            "-i", music.as_posix(),
            "-filter_complex", filter_complex,
            "-map", "0:v:0",
            "-map", "[aout]",
            "-c:v", "copy",
            "-c:a", "aac",
            "-shortest",
            output.as_posix(),
            "-y",
        ],
        check=True,
        capture_output=True,
    )
    return output.as_posix()


def build_music_filter(duck_for_speech: bool = True, music_volume: float = 0.3) -> str:
    """Expose filter graph for unit tests."""
    if duck_for_speech:
        return (
            f"[1:a]volume={music_volume}[music];"
            f"[0:a][music]sidechaincompress=threshold=0.05:ratio=8:attack=5:release=200[ducked];"
            f"[0:a][ducked]amix=inputs=2:duration=first[aout]"
        )
    return f"[1:a]volume={music_volume}[music];[0:a][music]amix=inputs=2:duration=first[aout]"
