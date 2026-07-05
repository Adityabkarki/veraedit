"""Multicam audio waveform sync — Multicam Sync Law."""
from __future__ import annotations

from pathlib import Path
from typing import Any


def compute_sync_offset_frames(
    reference_rms: list[float],
    feed_rms: list[float],
    *,
    fps: float = 30.0,
) -> int:
    """
    Cross-correlate RMS envelopes to find feed offset relative to reference.

    Returns offset in frames (positive = feed starts later than reference).
    """
    if not reference_rms or not feed_rms:
        return 0
    if len(reference_rms) == 1 and len(feed_rms) == 1:
        return 0

    best_offset = 0
    best_score = float("-inf")
    max_lag = min(len(reference_rms), len(feed_rms), int(fps * 2))

    for lag in range(-max_lag, max_lag + 1):
        score = 0.0
        count = 0
        for i, ref_val in enumerate(reference_rms):
            j = i + lag
            if 0 <= j < len(feed_rms):
                score += ref_val * feed_rms[j]
                count += 1
        if count and score > best_score:
            best_score = score
            best_offset = lag
    return best_offset


def rms_envelope_from_audio(audio_path: Path, *, target_fps: float = 30.0) -> list[float]:
    """Load audio and produce per-frame RMS envelope via librosa."""
    import librosa
    import numpy as np

    y, sr = librosa.load(audio_path.as_posix(), sr=44100, mono=True)
    hop = max(1, int(sr / target_fps))
    rms = librosa.feature.rms(y=y, frame_length=hop * 2, hop_length=hop)[0]
    return [float(v) for v in rms]


def sync_camera_feeds(
    feeds: list[dict[str, Any]],
    *,
    reference_index: int = 0,
    fps: float = 30.0,
) -> list[dict[str, Any]]:
    """
    Align multiple camera feeds to a shared timeline.

    Each feed: { id, label, sourceUrl, rmsEnvelope?: list[float] }
    """
    if not feeds:
        return []
    if len(feeds) == 1:
        return [{**feeds[0], "syncOffsetFrames": 0}]

    ref = feeds[reference_index]
    ref_rms = ref.get("rmsEnvelope") or [1.0]
    synced: list[dict[str, Any]] = []

    for i, feed in enumerate(feeds):
        if i == reference_index:
            synced.append({**feed, "syncOffsetFrames": 0})
            continue
        feed_rms = feed.get("rmsEnvelope") or ref_rms
        offset = compute_sync_offset_frames(ref_rms, feed_rms, fps=fps)
        synced.append({**feed, "syncOffsetFrames": offset})

    return synced
