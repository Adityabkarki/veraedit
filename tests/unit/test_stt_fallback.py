"""Phase 17 — STT Fallback Guarantee: ElevenLabs quota exhaustion must not stop the pipeline."""
from __future__ import annotations

import pathlib
import sys
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "apps" / "api"))

from elevenlabs.core.api_error import ApiError

import tasks.whisper as whisper_mod
from tasks.whisper import (
    TranscriptResult,
    is_elevenlabs_quota_error,
    transcribe_audio,
)

QUOTA_BODY = {
    "detail": {
        "type": "invalid_request",
        "code": "quota_exceeded",
        "status": "quota_exceeded",
        "message": (
            "This request exceeds your API key quota of 3000. "
            "You have 3 credits remaining, while 5 credits are required."
        ),
    }
}


def _fake_openai_result() -> TranscriptResult:
    return TranscriptResult(
        full_text="नमस्ते साथीहरू",
        language="nepali",
        duration=12.0,
        words=[],
        segments=[],
        cost_usd=12.0 * whisper_mod.OPENAI_STT_COST_PER_SECOND_USD,
        model="whisper-1",
    )


def test_quota_error_detection_covers_elevenlabs_wording():
    assert is_elevenlabs_quota_error(QUOTA_BODY["detail"]["message"])
    assert not is_elevenlabs_quota_error("invalid_api_key")


def test_quota_error_falls_back_to_openai(tmp_path):
    audio = tmp_path / "clip.mp3"
    audio.write_bytes(b"fake-audio")

    class FakeS2T:
        def convert(self, **kwargs):
            raise ApiError(status_code=400, body=QUOTA_BODY)

    fake_client = SimpleNamespace(speech_to_text=FakeS2T())

    with patch.object(whisper_mod, "ElevenLabs", return_value=fake_client), \
         patch.object(whisper_mod.settings, "OPENAI_API_KEY", "sk-test"), \
         patch.object(
             whisper_mod, "_transcribe_openai_whisper",
             return_value=_fake_openai_result(),
         ) as fallback:
        result = transcribe_audio(audio, language="ne")

    fallback.assert_called_once()
    assert result.model == "whisper-1"
    assert result.full_text == "नमस्ते साथीहरू"


def test_quota_error_without_openai_key_still_raises(tmp_path):
    audio = tmp_path / "clip.mp3"
    audio.write_bytes(b"fake-audio")

    class FakeS2T:
        def convert(self, **kwargs):
            raise ApiError(status_code=400, body=QUOTA_BODY)

    fake_client = SimpleNamespace(speech_to_text=FakeS2T())

    with patch.object(whisper_mod, "ElevenLabs", return_value=fake_client), \
         patch.object(whisper_mod.settings, "OPENAI_API_KEY", ""):
        try:
            transcribe_audio(audio, language="ne")
            raise AssertionError("expected RuntimeError")
        except RuntimeError as exc:
            assert "credit" in str(exc).lower()


def test_non_quota_error_does_not_fall_back(tmp_path):
    audio = tmp_path / "clip.mp3"
    audio.write_bytes(b"fake-audio")

    class FakeS2T:
        def convert(self, **kwargs):
            raise ApiError(
                status_code=401,
                body={"detail": {"status": "invalid_api_key", "message": "invalid_api_key"}},
            )

    fake_client = SimpleNamespace(speech_to_text=FakeS2T())

    with patch.object(whisper_mod, "ElevenLabs", return_value=fake_client), \
         patch.object(whisper_mod.settings, "OPENAI_API_KEY", "sk-test"), \
         patch.object(whisper_mod, "_transcribe_openai_whisper") as fallback:
        try:
            transcribe_audio(audio, language="ne")
            raise AssertionError("expected RuntimeError")
        except RuntimeError:
            pass

    fallback.assert_not_called()
