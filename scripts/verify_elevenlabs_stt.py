#!/usr/bin/env python3
"""Verify ElevenLabs STT key and transcribe sample_nepali.mp4. Run from repo root."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
sys.path.insert(0, str(API))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from config import settings
from services.elevenlabs_health import check_elevenlabs_account
from tasks.audio import extract_audio
from tasks.whisper import transcribe_audio


def main() -> int:
    print("ElevenLabs account:", json.dumps(check_elevenlabs_account(), indent=2))
    sample = ROOT / "sample_nepali.mp4"
    if not sample.exists():
        print("sample_nepali.mp4 not found")
        return 1
    if not settings.ELEVENLABS_API_KEY:
        print("ELEVENLABS_API_KEY not set in .env")
        return 1
    out = ROOT / "sample_nepali_whisper.mp3"
    extract_audio(sample, output_dir=out.parent)
    audio = out.parent / f"{sample.stem}_whisper.mp3"
    if not audio.exists():
        audio = out
    result = transcribe_audio(audio, language="ne")
    print("OK:", result.word_count, "words,", result.duration, "s")
    print("Text:", result.full_text[:120], "...")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print("FAILED:", exc)
        raise SystemExit(1)
