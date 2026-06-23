"""
ViraEdit — Audio extraction utilities.

Extracts audio from video files using FFmpeg for speech-to-text (ElevenLabs Scribe).
ElevenLabs accepts common audio/video formats; we chunk very large files locally.

If the audio exceeds 25MB it is split into chunks. Each chunk is
transcribed separately and the results are merged.

Windows note:
    FFmpeg path is resolved via shutil.which() first (PATH),
    then falls back to C:\\ffmpeg\\bin\\ffmpeg.exe.
    Use pathlib.Path throughout — never hardcode backslashes.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import structlog

log = structlog.get_logger("viraedit.audio")

# Chunk size for local split before upload (ElevenLabs allows up to ~3GB per file)
STT_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024  # 100MB per chunk
GROQ_MAX_FILE_SIZE_BYTES = STT_MAX_FILE_SIZE_BYTES  # legacy alias
STT_MAX_DURATION_SECONDS = 3600  # 1 hour per chunk
GROQ_MAX_DURATION_SECONDS = STT_MAX_DURATION_SECONDS  # legacy alias

# Audio extraction settings optimised for Whisper accuracy on Nepali speech
# 16kHz mono is what Whisper was trained on — exact match = best accuracy
WHISPER_SAMPLE_RATE = 16000
WHISPER_CHANNELS = 1
WHISPER_FORMAT = "mp3"     # Small, Groq-compatible
WHISPER_BITRATE = "64k"    # 64kbps mono is ~0.48MB/min — fits 25MB limit for ~50min
CHUNK_OVERLAP_SECONDS = 2.0  # overlap when splitting long audio for merge dedup


def _find_ffmpeg() -> Path:
    """
    Locate FFmpeg on this Windows system.

    Search order:
      1. PATH (installed via winget, choco, or scoop)
      2. C:\\ffmpeg\\bin\\ffmpeg.exe (manual install)
      3. C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe
    """
    # Try PATH first
    which = shutil.which("ffmpeg")
    if which:
        return Path(which)

    # Common Windows install locations
    candidates = [
        Path(r"C:\ffmpeg\bin\ffmpeg.exe"),
        Path(r"C:\Program Files\ffmpeg\bin\ffmpeg.exe"),
        Path(r"C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe"),
    ]
    for path in candidates:
        if path.exists():
            return path

    raise FileNotFoundError(
        "FFmpeg not found. Please install it:\n"
        "  winget install ffmpeg\n"
        "Or download from https://ffmpeg.org/download.html and add to PATH."
    )


def extract_audio(
    input_path: Path,
    output_dir: Optional[Path] = None,
) -> Path:
    """
    Extract and re-encode audio from a video/audio file for Whisper.

    Produces a 16kHz mono MP3 optimised for Nepali speech recognition.
    If output_dir is None, uses a system temp directory (auto-cleaned on exit).

    Args:
        input_path:  Path to the source video/audio file.
        output_dir:  Directory for the output audio file (optional).

    Returns:
        Path to the extracted audio MP3.

    Raises:
        FileNotFoundError: If FFmpeg is not found.
        RuntimeError:      If FFmpeg fails to extract audio.
    """
    ffmpeg = _find_ffmpeg()

    if output_dir is None:
        output_dir = Path(tempfile.gettempdir()) / "viraedit_audio"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Output filename mirrors the input name with .mp3 extension
    output_path = output_dir / (input_path.stem + "_whisper.mp3")

    # FFmpeg command:
    # -i input          — input file
    # -vn               — no video (audio-only output)
    # -acodec mp3       — MP3 codec
    # -ar 16000         — 16kHz sample rate (Whisper optimal)
    # -ac 1             — mono (halves file size vs stereo)
    # -ab 64k           — 64kbps bitrate (~0.48MB/min)
    # -y                — overwrite output without prompting
    cmd = [
        str(ffmpeg),
        "-i", str(input_path),
        "-vn",
        "-af", "highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11",
        "-acodec", "mp3",
        "-ar", str(WHISPER_SAMPLE_RATE),
        "-ac", str(WHISPER_CHANNELS),
        "-ab", WHISPER_BITRATE,
        "-y",
        str(output_path),
    ]

    log.info(
        "audio_extraction_starting",
        input=input_path.name,
        output=output_path.name,
    )

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=600,  # 10 minutes max
    )

    if result.returncode != 0:
        log.error(
            "audio_extraction_failed",
            returncode=result.returncode,
            stderr=result.stderr[-500:],  # last 500 chars of FFmpeg output
        )
        raise RuntimeError(
            f"FFmpeg audio extraction failed (exit {result.returncode}). "
            f"Please check that your video file is not corrupted."
        )

    size_mb = output_path.stat().st_size / (1024 * 1024)
    log.info(
        "audio_extracted",
        output=output_path.name,
        size_mb=round(size_mb, 2),
    )
    return output_path


def get_audio_duration(input_path: Path) -> Optional[float]:
    """
    Get the duration of an audio/video file in seconds using FFprobe.

    Returns None if duration cannot be determined (e.g., file is corrupt).
    """
    ffmpeg = _find_ffmpeg()
    ffprobe = ffmpeg.parent / "ffprobe.exe"
    if not ffprobe.exists():
        ffprobe = Path(shutil.which("ffprobe") or "ffprobe")

    cmd = [
        str(ffprobe),
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        str(input_path),
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            import json
            data = json.loads(result.stdout)
            duration_str = data.get("format", {}).get("duration")
            if duration_str:
                return float(duration_str)
    except Exception as exc:
        log.warning("duration_check_failed", error=str(exc))

    return None


def split_audio_if_needed(
    audio_path: Path,
    max_size_bytes: int = GROQ_MAX_FILE_SIZE_BYTES,
    output_dir: Optional[Path] = None,
) -> list[Path]:
    """
    Split audio into chunks if it exceeds Groq's 25MB limit.

    Returns a list of chunk paths. If no split needed, returns [audio_path].

    Chunks are named: <stem>_chunk_00.mp3, <stem>_chunk_01.mp3, etc.
    """
    size = audio_path.stat().st_size
    if size <= max_size_bytes:
        return [audio_path]

    if output_dir is None:
        output_dir = audio_path.parent

    # Calculate chunk duration: 25MB at 64kbps = ~50 minutes per chunk
    # Use 45 minutes to be safe
    chunk_duration_secs = 45 * 60

    ffmpeg = _find_ffmpeg()
    stem = audio_path.stem

    # FFmpeg segment muxer splits by time
    pattern = str(output_dir / f"{stem}_chunk_%02d.mp3")
    cmd = [
        str(ffmpeg),
        "-i", str(audio_path),
        "-f", "segment",
        "-segment_time", str(chunk_duration_secs),
        "-acodec", "copy",
        "-y",
        pattern,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        log.error("audio_split_failed", stderr=result.stderr[-500:])
        # Fall back to the original file and hope it fits
        return [audio_path]

    # Collect all generated chunks in order
    chunks = sorted(output_dir.glob(f"{stem}_chunk_*.mp3"))
    log.info("audio_split", chunks=len(chunks), original_mb=round(size / 1e6, 1))
    return chunks
