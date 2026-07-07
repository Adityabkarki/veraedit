"""Lossless FFmpeg concat stitching for render segments (Phase 14)."""
from __future__ import annotations

import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from config import settings

log = logging.getLogger("viraedit.render.stitch")


def stitch_segment_files(segment_paths: list[Path], output_path: Path) -> Path:
    """
    Concatenate segment MP4s losslessly (same codec params from Remotion).
    """
    if not segment_paths:
        raise ValueError("No segment files to stitch.")
    if len(segment_paths) == 1:
        segment_paths[0].replace(output_path)
        return output_path

    ordered = sorted(segment_paths, key=lambda p: p.name)
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".txt",
        delete=False,
        prefix="viraedit_concat_",
    ) as list_file:
        for path in ordered:
            escaped = path.as_posix().replace("'", "'\\''")
            list_file.write(f"file '{escaped}'\n")
        list_path = Path(list_file.name)

    try:
        subprocess.run(
            [
                settings.FFMPEG_PATH,
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                list_path.as_posix(),
                "-c",
                "copy",
                output_path.as_posix(),
            ],
            check=True,
            capture_output=True,
        )
    finally:
        list_path.unlink(missing_ok=True)

    return output_path


def verify_audio_continuity_at_joins(
    stitched_path: Path,
    segment_paths: list[Path],
    *,
    fps: float = 30.0,
) -> dict[str, Any]:
    """
    Sample RMS near each stitch boundary — flag large discontinuities.
    Returns { ok, joinChecks: [...] }.
    """
    if len(segment_paths) <= 1:
        return {"ok": True, "joinChecks": []}

    checks: list[dict[str, Any]] = []
    ok = True
    for i in range(len(segment_paths) - 1):
        left = segment_paths[i]
        right = segment_paths[i + 1]
        left_dur = _probe_duration(left)
        right_dur = _probe_duration(right)
        if left_dur <= 0 or right_dur <= 0:
            checks.append({"joinIndex": i, "skipped": True})
            continue

        left_rms = _sample_rms(left, max(0.0, left_dur - 0.05), left_dur)
        right_rms = _sample_rms(right, 0.0, min(0.05, right_dur))
        delta = abs(left_rms - right_rms)
        join_ok = delta < 0.35
        if not join_ok:
            ok = False
        checks.append(
            {
                "joinIndex": i,
                "leftRms": round(left_rms, 4),
                "rightRms": round(right_rms, 4),
                "delta": round(delta, 4),
                "ok": join_ok,
            }
        )

    return {"ok": ok, "joinChecks": checks}


def _probe_duration(path: Path) -> float:
    try:
        result = subprocess.run(
            [
                settings.FFPROBE_PATH,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                path.as_posix(),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        return float(result.stdout.strip() or 0)
    except Exception:
        return 0.0


def _sample_rms(path: Path, start: float, end: float) -> float:
    if end <= start:
        return 0.0
    try:
        result = subprocess.run(
            [
                settings.FFMPEG_PATH,
                "-ss",
                str(start),
                "-to",
                str(end),
                "-i",
                path.as_posix(),
                "-af",
                "volumedetect",
                "-f",
                "null",
                "-",
            ],
            capture_output=True,
            text=True,
        )
        for line in result.stderr.splitlines():
            if "mean_volume:" in line:
                # mean_volume: -20.3 dB → normalize to 0-1-ish
                db = float(line.split("mean_volume:")[1].split("dB")[0].strip())
                return max(0.0, min(1.0, (db + 60) / 60))
    except Exception:
        pass
    return 0.0
