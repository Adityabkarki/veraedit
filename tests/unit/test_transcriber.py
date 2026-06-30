"""
Unit tests for transcriber processor (Module 03).
"""
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


@pytest.mark.asyncio
async def test_transcribe_video_uses_elevenlabs(monkeypatch, tmp_path: Path):
    from processors import transcriber

    video = tmp_path / "clip.mp4"
    video.write_bytes(b"fake")
    audio = tmp_path / "clip_audio.wav"
    monkeypatch.setattr(transcriber, "_extract_audio", lambda _p: audio)

    expected = {
        "language": "ne",
        "words": [{"word": "test", "start": 0.0, "end": 0.5, "confidence": 0.9}],
        "segments": [{"text": "test", "start": 0.0, "end": 0.5, "words": []}],
        "full_text": "test",
    }
    monkeypatch.setattr(
        transcriber,
        "_transcribe_elevenlabs",
        AsyncMock(return_value=expected),
    )
    monkeypatch.setattr(
        transcriber,
        "_transcribe_whisper_local",
        MagicMock(side_effect=AssertionError("should not fallback")),
    )

    result = await transcriber.transcribe_video(video)
    assert result["full_text"] == "test"
    assert result["language"] == "ne"


@pytest.mark.asyncio
async def test_transcribe_video_falls_back_to_whisper(monkeypatch, tmp_path: Path):
    from processors import transcriber

    video = tmp_path / "clip.mp4"
    video.write_bytes(b"fake")
    audio = tmp_path / "clip_audio.wav"
    audio.write_bytes(b"wav")
    monkeypatch.setattr(transcriber, "_extract_audio", lambda _p: audio)

    async def fail_elevenlabs(_a, _l):
        raise RuntimeError("quota exceeded")

    fallback = {
        "language": "ne",
        "words": [],
        "segments": [],
        "full_text": "",
    }
    monkeypatch.setattr(transcriber, "_transcribe_elevenlabs", fail_elevenlabs)
    monkeypatch.setattr(transcriber, "_transcribe_whisper_local", lambda _a, _l: fallback)

    result = await transcriber.transcribe_video(video)
    assert result == fallback


def test_build_segments_on_sentence_end():
    """ElevenLabs response builder splits on Nepali danda."""
    words = [
        {"word": "एक", "start": 0.0, "end": 0.3, "confidence": 0.0},
        {"word": "वाक्य।", "start": 0.3, "end": 0.8, "confidence": 0.0},
        {"word": "अर्को", "start": 1.0, "end": 1.4, "confidence": 0.0},
    ]
    segments = []
    current_seg = {"words": [words[0]], "start": words[0]["start"]}
    for w in words[1:]:
        gap = w["start"] - current_seg["words"][-1]["end"]
        last_word = current_seg["words"][-1]["word"]
        if gap > 0.8 or any(last_word.endswith(p) for p in (".", "?", "!", "।")):
            text = " ".join(x["word"] for x in current_seg["words"])
            segments.append({
                "text": text,
                "start": current_seg["start"],
                "end": current_seg["words"][-1]["end"],
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
        })

    assert len(segments) == 2
    assert "।" in segments[0]["text"]
