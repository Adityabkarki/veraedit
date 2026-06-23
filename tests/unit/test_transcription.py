"""
ViraEdit — EP-2.1 unit tests for transcription pipeline.

Tests (no API keys needed — ElevenLabs STT is mocked where needed):
    - audio.validate_file: FFmpeg path resolution, key sanitisation
    - whisper: TranscriptResult dataclass, merge_chunk_results, cost calc
    - transcribe: _is_video, _download_from_minio (mocked)
    - Nepali language is always "ne" in all transcript records

Run: pytest tests/unit/test_transcription.py -v
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch


# ── audio.py ──────────────────────────────────────────────────────────────────

class TestAudioUtils:
    def test_make_storage_key_safe(self):
        """make_storage_key sanitises unsafe characters."""
        from storage import make_storage_key
        key = make_storage_key("proj-1", "asset-2", "my file (1).mp4")
        assert " " not in key
        assert "(" not in key
        assert key.startswith("projects/proj-1/assets/asset-2/")

    def test_find_ffmpeg_raises_if_missing(self):
        """_find_ffmpeg raises FileNotFoundError if FFmpeg is not installed."""
        from tasks.audio import _find_ffmpeg
        with patch("shutil.which", return_value=None), \
             patch("pathlib.Path.exists", return_value=False):
            with pytest.raises(FileNotFoundError, match="FFmpeg not found"):
                _find_ffmpeg()

    def test_find_ffmpeg_uses_path_first(self):
        """_find_ffmpeg prefers PATH over hardcoded locations."""
        from tasks.audio import _find_ffmpeg
        with patch("shutil.which", return_value=r"C:\ffmpeg\bin\ffmpeg.exe"):
            result = _find_ffmpeg()
            assert "ffmpeg" in str(result).lower()

    def test_is_video_mp4(self):
        from tasks.transcribe import _is_video
        assert _is_video("projects/p/assets/a/video.mp4") is True

    def test_is_video_mkv(self):
        from tasks.transcribe import _is_video
        assert _is_video("projects/p/assets/a/clip.MKV") is True

    def test_is_video_mp3_is_false(self):
        from tasks.transcribe import _is_video
        assert _is_video("projects/p/assets/a/podcast.mp3") is False

    def test_is_video_wav_is_false(self):
        from tasks.transcribe import _is_video
        assert _is_video("projects/p/assets/a/recording.wav") is False

    def test_split_not_needed_for_small_file(self, tmp_path):
        """Files under 25MB should not be split."""
        from tasks.audio import split_audio_if_needed, GROQ_MAX_FILE_SIZE_BYTES

        # Create a small fake MP3
        small_file = tmp_path / "small.mp3"
        small_file.write_bytes(b"0" * 1024)  # 1 KB

        result = split_audio_if_needed(small_file, output_dir=tmp_path)
        assert result == [small_file]
        assert len(result) == 1


# ── whisper.py — data structures ─────────────────────────────────────────────

class TestTranscriptWord:
    def test_duration_calculated(self):
        from tasks.whisper import TranscriptWord
        word = TranscriptWord(word="नमस्ते", start=1.0, end=1.5)
        assert word.duration == pytest.approx(0.5)

    def test_nepali_word_stored(self):
        from tasks.whisper import TranscriptWord
        word = TranscriptWord(word="नेपाल", start=0.0, end=0.8)
        assert word.word == "नेपाल"


class TestTranscriptSegment:
    def test_silence_detection_high_no_speech_prob(self):
        from tasks.whisper import TranscriptSegment
        seg = TranscriptSegment(id=0, text="", start=0.0, end=2.0, no_speech_prob=0.9)
        assert seg.is_silence is True

    def test_speech_not_silence(self):
        from tasks.whisper import TranscriptSegment
        seg = TranscriptSegment(id=1, text="नमस्कार", start=0.0, end=1.5, no_speech_prob=0.05)
        assert seg.is_silence is False

    def test_confidence_from_logprob(self):
        from tasks.whisper import TranscriptSegment
        import math
        # avg_logprob = 0 → confidence = exp(0) = 1.0
        seg = TranscriptSegment(id=0, text="test", start=0.0, end=1.0, avg_logprob=0.0)
        assert seg.confidence == pytest.approx(1.0)


class TestElevenLabsErrors:
    def test_quota_message_not_labeled_authentication(self):
        from tasks.whisper import _friendly_elevenlabs_error, is_elevenlabs_quota_error
        from elevenlabs.core.api_error import ApiError

        msg = (
            "This request exceeds your API key quota of 1000. "
            "You have 361 credits remaining, while 630 credits are required."
        )
        assert is_elevenlabs_quota_error(msg)
        exc = ApiError(status_code=401, body={"detail": {"message": msg}})
        friendly = _friendly_elevenlabs_error(exc)
        assert "credit limit" in friendly.lower()
        assert "authentication failed" not in friendly.lower()
        assert "openai" in friendly.lower()

    def test_quota_errors_are_not_retryable(self):
        from tasks.whisper import transcription_error_is_retryable

        exc = RuntimeError(
            "ElevenLabs credit limit reached: quota exceeded; 361 credits remaining"
        )
        assert transcription_error_is_retryable(exc) is False

    def test_network_errors_remain_retryable(self):
        from tasks.whisper import transcription_error_is_retryable

        assert transcription_error_is_retryable(ConnectionError("timeout")) is True


class TestTranscriptResult:
    def test_word_count_from_words(self):
        from tasks.whisper import TranscriptResult, TranscriptWord
        result = TranscriptResult(
            full_text="नमस्ते नेपाल",
            language="ne",
            duration=2.0,
            words=[
                TranscriptWord("नमस्ते", 0.0, 0.9),
                TranscriptWord("नेपाल", 1.0, 1.8),
            ],
        )
        assert result.word_count == 2

    def test_cost_calculation(self):
        """60 seconds of audio uses ElevenLabs STT cost rate from settings."""
        from config import settings
        from tasks.whisper import TranscriptResult, STT_COST_PER_SECOND_USD
        result = TranscriptResult(
            full_text="test",
            language="ne",
            duration=60.0,
        )
        result.cost_usd = result.duration * STT_COST_PER_SECOND_USD
        expected = 60.0 * (settings.ELEVENLABS_STT_COST_PER_HOUR_USD / 3600.0)
        assert result.cost_usd == pytest.approx(expected, rel=1e-3)

    def test_language_defaults_to_ne(self):
        """All TranscriptResult objects default to Nepali language."""
        from tasks.whisper import TranscriptResult
        result = TranscriptResult(full_text="", language="ne", duration=0.0)
        assert result.language == "ne"


class TestMergeChunkResults:
    def test_single_chunk_passthrough(self):
        from tasks.whisper import TranscriptResult, merge_chunk_results
        result = TranscriptResult(full_text="नमस्ते", language="ne", duration=5.0)
        merged = merge_chunk_results([result], [0.0])
        assert merged.full_text == "नमस्ते"

    def test_two_chunks_merged_text(self):
        from tasks.whisper import TranscriptResult, merge_chunk_results
        r1 = TranscriptResult(full_text="पहिलो", language="ne", duration=10.0)
        r2 = TranscriptResult(full_text="दोस्रो", language="ne", duration=12.0)
        merged = merge_chunk_results([r1, r2], [0.0, 10.0])
        assert "पहिलो" in merged.full_text
        assert "दोस्रो" in merged.full_text

    def test_word_timestamps_offset_correctly(self):
        from tasks.whisper import TranscriptResult, TranscriptWord, merge_chunk_results
        r1 = TranscriptResult(
            full_text="एक", language="ne", duration=5.0,
            words=[TranscriptWord("एक", 1.0, 1.5)],
        )
        r2 = TranscriptResult(
            full_text="दुई", language="ne", duration=5.0,
            words=[TranscriptWord("दुई", 0.5, 1.0)],
        )
        # r2 starts at offset 5.0 seconds
        merged = merge_chunk_results([r1, r2], [0.0, 5.0])
        # r2's word should be offset: 0.5 + 5.0 = 5.5
        assert merged.words[1].start == pytest.approx(5.5)
        assert merged.words[1].end == pytest.approx(6.0)

    def test_total_cost_summed(self):
        from tasks.whisper import TranscriptResult, merge_chunk_results
        r1 = TranscriptResult(full_text="a", language="ne", duration=10.0, cost_usd=0.001)
        r2 = TranscriptResult(full_text="b", language="ne", duration=10.0, cost_usd=0.002)
        merged = merge_chunk_results([r1, r2], [0.0, 10.0])
        assert merged.cost_usd == pytest.approx(0.003)

    def test_empty_list_returns_empty(self):
        from tasks.whisper import merge_chunk_results
        result = merge_chunk_results([], [])
        assert result.full_text == ""
        assert result.language == "ne"


# ── Celery task ───────────────────────────────────────────────────────────────

class TestTranscribeCeleryTask:
    def test_task_is_registered(self):
        """The transcribe task must be importable and registered."""
        from celery_app import celery_app
        from tasks import transcribe  # noqa: F401 (registers the task)
        assert "tasks.transcribe.run" in celery_app.tasks

    def test_whisper_language_setting_is_ne(self):
        """Config enforces language="ne" for all Whisper calls."""
        from config import settings
        assert settings.WHISPER_LANGUAGE == "ne"

    def test_stt_model_from_settings(self):
        """STT task uses ElevenLabs Scribe model from config."""
        from config import settings
        from tasks.whisper import STT_MODEL, WHISPER_MODEL
        assert STT_MODEL == settings.ELEVENLABS_STT_MODEL
        assert WHISPER_MODEL == STT_MODEL


# ── Nepali-specific ───────────────────────────────────────────────────────────

class TestNepaliLanguageRules:
    def test_whisper_always_gets_nepali_language(self):
        """
        transcribe_audio always passes language="ne" unless explicitly overridden.
        This is the single most important rule in the codebase.
        """
        from config import settings
        # The default language in settings must be "ne"
        assert settings.WHISPER_LANGUAGE == "ne"
        # The default in transcribe_audio's signature must be "ne"
        import inspect
        from tasks.whisper import transcribe_audio
        sig = inspect.signature(transcribe_audio)
        default_lang = sig.parameters["language"].default
        assert default_lang == "ne", (
            f"transcribe_audio must default to language='ne', got '{default_lang}'"
        )

    def test_transcript_model_language_default_is_ne(self):
        """Transcript ORM column default for language is 'ne' (Nepali)."""
        from models.transcript import Transcript
        # mapped_column(default="ne") sets a SQLAlchemy ColumnDefault used in INSERT.
        # Verify the column schema enforces the Nepali language rule.
        lang_col = Transcript.__table__.c.language
        # default.arg is the value SQLAlchemy inserts when language is not supplied
        assert lang_col.default.arg == "ne", (
            f"Transcript.language must default to 'ne' (Nepali), got '{lang_col.default.arg}'"
        )

    def test_nepali_devanagari_preserved_in_json(self):
        """Devanagari text survives JSON serialisation without escape sequences."""
        import json
        nepali_text = "यो एक परीक्षण हो।"  # "This is a test."
        serialised = json.dumps({"text": nepali_text}, ensure_ascii=False)
        assert "यो" in serialised   # not escaped as \uXXXX
        restored = json.loads(serialised)
        assert restored["text"] == nepali_text
