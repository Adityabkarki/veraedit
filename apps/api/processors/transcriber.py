"""
ViraEdit — Video transcription processor (Module 03).

Primary: ElevenLabs Scribe v2 (language=ne).
Fallback: faster-whisper local when ElevenLabs fails.
"""
from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path
from typing import Any

import httpx

from config import settings

log = logging.getLogger("viraedit.processors.transcriber")


async def transcribe_video(video_path: str | Path, language: str | None = None) -> dict[str, Any]:
    """
    Transcribe using ElevenLabs Scribe v2 (primary) or faster-whisper (fallback).

    Returns:
        {language, words: [{word, start, end, confidence}], segments, full_text}
    """
    path = Path(video_path)
    audio_path = _extract_audio(path)
    lang = language or settings.WHISPER_LANGUAGE

    try:
        result = await _transcribe_elevenlabs(audio_path, lang)
    except Exception as exc:
        log.warning("elevenlabs_transcription_failed_using_whisper: %s", exc)
        result = _transcribe_whisper_local(audio_path, lang)

    if audio_path.exists():
        audio_path.unlink(missing_ok=True)
    return result


async def _transcribe_elevenlabs(audio_path: Path, language: str) -> dict[str, Any]:
    """ElevenLabs Scribe v2 — best for Nepali, returns word-level timestamps."""
    if not settings.ELEVENLABS_API_KEY:
        raise ValueError(
            "ELEVENLABS_API_KEY is not set. Add it to your .env file to transcribe audio."
        )

    url = "https://api.elevenlabs.io/v1/speech-to-text"
    headers = {"xi-api-key": settings.ELEVENLABS_API_KEY}
    audio_bytes = audio_path.read_bytes()

    lang_map = {"ne": "nep", "en": "eng"}
    language_code = lang_map.get(language.lower(), language.lower())

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            url,
            headers=headers,
            files={"file": ("audio.wav", audio_bytes, "audio/wav")},
            data={
                "model_id": settings.ELEVENLABS_STT_MODEL,
                "language_code": language_code,
                "timestamps_granularity": "word",
                "diarize": "false",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    words: list[dict[str, Any]] = []
    segments: list[dict[str, Any]] = []

    for word_obj in data.get("words", []):
        if word_obj.get("type") != "word":
            continue
        words.append({
            "word": word_obj["text"],
            "start": float(word_obj["start"]),
            "end": float(word_obj["end"]),
            "confidence": float(word_obj.get("logprob", 0)),
        })

    if words:
        current_seg: dict[str, Any] = {"words": [words[0]], "start": words[0]["start"]}
        for w in words[1:]:
            gap = w["start"] - current_seg["words"][-1]["end"]
            last_word = current_seg["words"][-1]["word"]
            if gap > 0.8 or any(last_word.endswith(p) for p in (".", "?", "!", "।")):
                text = " ".join(x["word"] for x in current_seg["words"])
                segments.append({
                    "text": text,
                    "start": current_seg["start"],
                    "end": current_seg["words"][-1]["end"],
                    "words": current_seg["words"],
                })
                current_seg = {"words": [w], "start": w["start"]}
            else:
                current_seg["words"].append(w)
        if current_seg["words"]:
            text = " ".join(x["word"] for x in current_seg["words"])
            segments.append({
                "text": text,
                "start": current_seg["start"],
                "end": current_seg["words"][-1]["end"],
                "words": current_seg["words"],
            })

    return {
        "language": data.get("language_code", language),
        "words": words,
        "segments": segments,
        "full_text": data.get("text", ""),
    }


def _transcribe_whisper_local(audio_path: Path, language: str) -> dict[str, Any]:
    """Local faster-whisper fallback when ElevenLabs is unavailable."""
    from faster_whisper import WhisperModel

    model = WhisperModel("medium", device="cpu", compute_type="int8")
    segments_iter, info = model.transcribe(
        audio_path.as_posix(),
        language=language,
        word_timestamps=True,
        vad_filter=True,
    )
    words: list[dict[str, Any]] = []
    segments: list[dict[str, Any]] = []
    for seg in segments_iter:
        seg_words = [
            {
                "word": w.word.strip(),
                "start": round(w.start, 3),
                "end": round(w.end, 3),
                "confidence": round(w.probability, 3),
            }
            for w in (seg.words or [])
        ]
        words.extend(seg_words)
        segments.append({
            "text": seg.text.strip(),
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "words": seg_words,
        })
    return {
        "language": info.language,
        "words": words,
        "segments": segments,
        "full_text": " ".join(s["text"] for s in segments),
    }


def _extract_audio(video_path: Path) -> Path:
    """Extract 16 kHz mono WAV for STT."""
    out = video_path.with_name(f"{video_path.stem}_audio.wav")
    subprocess.run(
        [
            settings.FFMPEG_PATH,
            "-i",
            video_path.as_posix(),
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            out.as_posix(),
            "-y",
        ],
        check=True,
        capture_output=True,
    )
    return out


def chunk_audio(audio_path: Path, chunk_duration_min: int = 20) -> list[Path]:
    """Split audio into chunks for long videos (>25 min)."""
    chunk_sec = chunk_duration_min * 60
    base = audio_path.with_suffix("")
    pattern = f"{base}_chunk%03d.wav"
    subprocess.run(
        [
            settings.FFMPEG_PATH,
            "-i",
            audio_path.as_posix(),
            "-f",
            "segment",
            "-segment_time",
            str(chunk_sec),
            "-c",
            "copy",
            pattern,
            "-y",
        ],
        check=True,
        capture_output=True,
    )
    import glob

    return sorted(Path(p) for p in glob.glob(f"{base}_chunk*.wav"))
