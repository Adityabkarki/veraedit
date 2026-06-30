"""
ViraEdit — Text-based video editing processor (Module 04).

FFmpeg cuts, silence detection, and filler word detection for Descript-style editing.
"""
from __future__ import annotations

import json
import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from config import settings

log = logging.getLogger("viraedit.processors.text_editor")

FILLERS_EN = {
    "um", "uh", "like", "you know", "literally", "basically",
    "actually", "right", "so", "okay", "yeah", "hmm", "er",
    "kind of", "sort of", "i mean",
}
FILLERS_NE = {
    "हैन", "अनि", "भने", "त", "हो", "नि", "गर्छु", "भनेको",
}


def apply_cuts(input_path: str | Path, output_path: str | Path, cuts: list[dict[str, Any]]) -> str:
    """Remove cut ranges from video and concatenate kept segments."""
    in_path = Path(input_path)
    out_path = Path(output_path)
    duration = get_duration(in_path)
    keep = cuts_to_keep(cuts, duration)
    if not keep:
        raise ValueError("All segments would be removed. Keep at least one part of the video.")

    tmp_dir = Path(tempfile.mkdtemp(prefix="viraedit_cuts_"))
    part_files: list[Path] = []

    try:
        for i, seg in enumerate(keep):
            part = tmp_dir / f"part{i}.mp4"
            subprocess.run(
                [
                    settings.FFMPEG_PATH,
                    "-i",
                    in_path.as_posix(),
                    "-ss",
                    str(seg["start"]),
                    "-to",
                    str(seg["end"]),
                    "-c",
                    "copy",
                    part.as_posix(),
                    "-y",
                ],
                check=True,
                capture_output=True,
            )
            part_files.append(part)

        concat_file = tmp_dir / "concat.txt"
        concat_file.write_text(
            "\n".join(f"file '{p.as_posix()}'" for p in part_files),
            encoding="utf-8",
        )

        subprocess.run(
            [
                settings.FFMPEG_PATH,
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                concat_file.as_posix(),
                "-c",
                "copy",
                out_path.as_posix(),
                "-y",
            ],
            check=True,
            capture_output=True,
        )
    finally:
        for p in tmp_dir.iterdir():
            try:
                p.unlink()
            except OSError:
                pass
        try:
            tmp_dir.rmdir()
        except OSError:
            pass

    return out_path.as_posix()


def cuts_to_keep(cuts: list[dict[str, Any]], total: float) -> list[dict[str, float]]:
    """Invert cut ranges into keep segments."""
    if not cuts:
        return [{"start": 0.0, "end": total}]
    sorted_cuts = sorted(cuts, key=lambda c: float(c["start"]))
    keep: list[dict[str, float]] = []
    cursor = 0.0
    for c in sorted_cuts:
        start = float(c["start"])
        end = float(c["end"])
        if start > cursor + 0.05:
            keep.append({"start": cursor, "end": start})
        cursor = max(cursor, end)
    if cursor < total - 0.05:
        keep.append({"start": cursor, "end": total})
    return keep


def detect_silences(
    video_path: str | Path,
    min_duration: float = 0.8,
    threshold_db: float = -35,
) -> list[dict[str, float]]:
    """Detect silent regions using FFmpeg silencedetect."""
    path = Path(video_path)
    cmd = [
        settings.FFMPEG_PATH,
        "-i",
        path.as_posix(),
        "-af",
        f"silencedetect=noise={threshold_db}dB:d={min_duration}",
        "-f",
        "null",
        "-",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    silences: list[dict[str, float]] = []
    start: float | None = None
    for line in result.stderr.splitlines():
        if "silence_start" in line:
            try:
                start = float(line.split("silence_start: ")[1].strip())
            except (IndexError, ValueError):
                start = None
        elif "silence_end" in line and start is not None:
            try:
                end = float(line.split("silence_end: ")[1].split()[0])
                silences.append({"start": start, "end": end})
                start = None
            except (IndexError, ValueError):
                start = None
    return silences


def detect_fillers(words: list[dict[str, Any]], language: str = "ne") -> list[dict[str, Any]]:
    """Return cut ranges for filler words in a word-timestamp list."""
    fillers = FILLERS_NE | FILLERS_EN if language == "ne" else FILLERS_EN
    cuts: list[dict[str, Any]] = []
    for w in words:
        token = str(w.get("word", "")).lower().strip(".,!?।")
        if token in fillers:
            cuts.append({
                "start": float(w["start"]),
                "end": float(w["end"]),
                "reason": "filler",
            })
    return cuts


def get_duration(path: str | Path) -> float:
    """Return media duration in seconds via ffprobe."""
    media = Path(path)
    cmd = [
        settings.FFPROBE_PATH,
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        media.as_posix(),
    ]
    data = json.loads(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout)
    return float(data["format"].get("duration", 0))
