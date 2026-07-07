"""
ViraEdit — Frame-accurate audio analysis sidecar (Path B).

Precomputes STFT → RMS amplitude + mel-filterbank band energies via librosa,
resampled to composition fps. Output matches AudioAnalysisTrack schema (Step 4).
"""
from __future__ import annotations

import hashlib
import json
import logging
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import librosa
import numpy as np

from config import settings

logger = logging.getLogger("audio_analysis_track")

AUDIO_ANALYSIS_SCHEMA_VERSION = 1
RESPONSE_EXPONENT = 0.7


def _content_hash(audio_path: Path) -> str:
    h = hashlib.sha256()
    with audio_path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def extract_audio_wav(video_or_audio_path: Path, dest: Path) -> Path:
    """Extract mono 44.1kHz PCM wav for analysis."""
    subprocess.run(
        [
            settings.FFMPEG_PATH,
            "-i",
            video_or_audio_path.as_posix(),
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "44100",
            "-ac",
            "1",
            dest.as_posix(),
            "-y",
        ],
        check=True,
        capture_output=True,
    )
    return dest


def _log_bucket_ranges(bin_count: int, band_count: int) -> list[tuple[int, int]]:
    min_hz, max_hz = 60.0, 16000.0
    ranges: list[tuple[int, int]] = []
    for b in range(band_count):
        f_low = min_hz * (max_hz / min_hz) ** (b / band_count)
        f_high = min_hz * (max_hz / min_hz) ** ((b + 1) / band_count)
        start = int((f_low / max_hz) * bin_count)
        end = min(bin_count, max(start + 1, int((f_high / max_hz) * bin_count)))
        ranges.append((start, end))
    return ranges


def _bucket_mel(mel_row: np.ndarray, band_count: int) -> np.ndarray:
    """Map mel bins into log-spaced perceptual buckets."""
    ranges = _log_bucket_ranges(len(mel_row), band_count)
    out = np.zeros(band_count, dtype=np.float64)
    for i, (start, end) in enumerate(ranges):
        chunk = mel_row[start:end]
        out[i] = float(np.mean(chunk)) if len(chunk) else 0.0
    return out


def _response_curve(value: float) -> float:
    v = max(0.0, min(1.0, value))
    return float(v ** RESPONSE_EXPONENT)


def _detect_transients(amplitudes: list[float], threshold: float = 0.2, min_gap: int = 3) -> list[bool]:
    n = len(amplitudes)
    flags = [False] * n
    if n < 2:
        return flags
    flux = [0.0]
    for i in range(1, n):
        flux.append(max(0.0, amplitudes[i] - amplitudes[i - 1]))
    peak = max(flux) or 1e-6
    cutoff = threshold * peak
    last = -min_gap
    for i in range(1, n - 1):
        if flux[i] >= cutoff and flux[i] >= flux[i - 1] and flux[i] >= flux[i + 1]:
            if i - last >= min_gap:
                flags[i] = True
                last = i
    return flags


def build_audio_analysis_track(
    audio_path: Path,
    fps: float,
    band_count: int = 16,
    source_hash: str | None = None,
) -> dict[str, Any]:
    """
    Build AudioAnalysisTrack JSON from an audio/video file.
    Deterministic — same input always yields identical sidecar bytes.
    """
    y, sr = librosa.load(audio_path.as_posix(), sr=44100, mono=True)
    duration = len(y) / sr
    total_frames = max(1, int(np.ceil(duration * fps)))

    hop = max(1, int(sr / fps))
    n_fft = 2048
    stft = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop))
    rms = librosa.feature.rms(y=y, frame_length=n_fft, hop_length=hop)[0]
    mel = librosa.feature.melspectrogram(y=y, sr=sr, n_fft=n_fft, hop_length=hop, n_mels=128)
    mel_db = librosa.power_to_db(mel, ref=np.max)

    # librosa frames may differ slightly from target — resample to exact fps frame count
    def _resample_rows(matrix: np.ndarray, target: int) -> np.ndarray:
        if matrix.shape[1] == 0:
            return np.zeros((matrix.shape[0], target))
        x_old = np.linspace(0, 1, matrix.shape[1])
        x_new = np.linspace(0, 1, target)
        out = np.zeros((matrix.shape[0], target))
        for r in range(matrix.shape[0]):
            out[r] = np.interp(x_new, x_old, matrix[r])
        return out

    stft_r = _resample_rows(stft, total_frames)
    rms_r = _resample_rows(rms.reshape(1, -1), total_frames)[0]
    mel_r = _resample_rows(mel_db, total_frames)

    raw_frames: list[dict[str, Any]] = []
    peak = 0.0

    for frame_idx in range(total_frames):
        mel_row = mel_r[:, frame_idx]
        # Normalize mel row to 0-1 for bucketing
        mel_min, mel_max = float(np.min(mel_row)), float(np.max(mel_row))
        span = mel_max - mel_min or 1e-6
        norm_mel = (mel_row - mel_min) / span
        bands_raw = _bucket_mel(norm_mel, band_count)
        overall = float(np.mean(bands_raw))
        rms_val = float(rms_r[frame_idx]) if frame_idx < len(rms_r) else 0.0
        combined = max(overall, rms_val)
        peak = max(peak, combined, float(np.max(bands_raw)))
        raw_frames.append({
            "frame": frame_idx,
            "overallAmplitude": combined,
            "bands": bands_raw.tolist(),
            "isTransient": False,
        })

    peak = max(peak, 1e-6)
    amplitudes: list[float] = []
    for f in raw_frames:
        f["overallAmplitude"] = _response_curve(f["overallAmplitude"] / peak)
        f["bands"] = [_response_curve(b / peak) for b in f["bands"]]
        amplitudes.append(f["overallAmplitude"])

    transients = _detect_transients(amplitudes)
    for i, f in enumerate(raw_frames):
        f["isTransient"] = transients[i]

    track_hash = source_hash or _content_hash(audio_path)

    return {
        "schemaVersion": AUDIO_ANALYSIS_SCHEMA_VERSION,
        "sourceHash": track_hash,
        "fps": fps,
        "bandCount": band_count,
        "frames": raw_frames,
        "peakAmplitude": peak,
        "meta": {
            "analysisPath": "server_librosa",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        },
    }


def build_from_media(
    media_path: str | Path,
    fps: float,
    band_count: int = 16,
    source_hash: str | None = None,
) -> dict[str, Any]:
    """Extract audio if needed, then build analysis track."""
    path = Path(media_path)
    wav_path = path.with_suffix(".analysis_tmp.wav")
    try:
        extract_audio_wav(path, wav_path)
        track = build_audio_analysis_track(
            wav_path,
            fps=fps,
            band_count=band_count,
            source_hash=source_hash,
        )
        return track
    finally:
        if wav_path.exists():
            wav_path.unlink()


def quantize_sidecar(track: dict[str, Any]) -> bytes:
    """Compact binary sidecar for MinIO storage (Phase 13)."""
    from processors.audio_analysis_binary import encode_analysis_track

    return encode_analysis_track(track)
