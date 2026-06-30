"""
ViraEdit — RMS audio energy analysis (Phase 04 patch).

Second signal for chapter boundaries and sizzle/highlight detection.
"""
from __future__ import annotations

import logging
import subprocess
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

from config import settings

logger = logging.getLogger("audio_energy")


def extract_energy_profile(
    video_path: str | Path,
    window_seconds: float = 0.5,
) -> list[dict[str, Any]]:
    """
    Extract RMS audio energy over time as normalized 0-1 windows.
    """
    video = Path(video_path)
    audio_path = video.with_name(f"{video.name}_energy_tmp.wav")

    subprocess.run(
        [
            settings.FFMPEG_PATH,
            "-i", video.as_posix(),
            "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
            audio_path.as_posix(), "-y",
        ],
        check=True,
        capture_output=True,
    )

    try:
        data, rate = sf.read(audio_path.as_posix())
        if data.ndim > 1:
            data = data.mean(axis=1)

        window_samples = int(rate * window_seconds)
        windows: list[dict[str, Any]] = []
        for i in range(0, len(data), window_samples):
            chunk = data[i : i + window_samples]
            if len(chunk) == 0:
                continue
            rms = float(np.sqrt(np.mean(chunk.astype(np.float64) ** 2)))
            windows.append({
                "start": round(i / rate, 2),
                "end": round(min(i + window_samples, len(data)) / rate, 2),
                "energy_raw": rms,
            })

        if not windows:
            return []

        max_energy = max(w["energy_raw"] for w in windows) or 1.0
        for w in windows:
            w["energy"] = round(w["energy_raw"] / max_energy, 3)
            del w["energy_raw"]

        return windows
    finally:
        if audio_path.exists():
            audio_path.unlink()


def find_energy_spikes(
    energy_profile: list[dict[str, Any]],
    threshold: float = 0.75,
    min_gap_seconds: float = 3.0,
) -> list[dict[str, Any]]:
    """
    Timestamps where energy crosses threshold, with minimum gap between spikes.
    """
    spikes: list[dict[str, Any]] = []
    last_spike_time = -999.0

    for window in energy_profile:
        if (
            window["energy"] >= threshold
            and (window["start"] - last_spike_time) >= min_gap_seconds
        ):
            spikes.append({"timestamp": window["start"], "energy": window["energy"]})
            last_spike_time = window["start"]
            logger.info(
                "energy_spike t=%s energy=%s",
                window["start"],
                window["energy"],
            )

    return spikes
