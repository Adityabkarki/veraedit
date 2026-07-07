"""
ViraEdit — ElevenLabs Scribe speech-to-text client.

Transcribes Nepali speech (Devanagari) using ElevenLabs Speech-to-Text API.
Always requests language_code for Nepali (mapped from settings WHISPER_LANGUAGE="ne").

Model: scribe_v2 (batch, word-level timestamps, up to 3GB / 10h per file).

Output is normalized to TranscriptResult for the rest of the pipeline
(captions, filler detection, scene analysis).

Reference: https://elevenlabs.io/docs/api-reference/speech-to-text
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import structlog
from elevenlabs import ElevenLabs
from elevenlabs.core.api_error import ApiError

from config import settings

log = structlog.get_logger("viraedit.speech_to_text")

# ElevenLabs Scribe approximate pricing (USD per second of audio) — update if billing changes
STT_COST_PER_SECOND_USD = settings.ELEVENLABS_STT_COST_PER_HOUR_USD / 3600.0
WHISPER_COST_PER_SECOND_USD = STT_COST_PER_SECOND_USD  # legacy alias for tests

STT_MODEL = settings.ELEVENLABS_STT_MODEL
WHISPER_MODEL = STT_MODEL  # legacy alias

NEPALI_DEFAULT_KEYTERMS = [
    "नेपाली",
    "Nepali",
    "podcast",
    "काठमाडौं",
]

NEPALI_REGENERATE_PROMPT_PREFIX = (
    "Improve this Nepali transcript while keeping the same meaning:\n"
)

# ISO-639-1 (app) → ISO-639-3 (ElevenLabs) for Nepali
_LANGUAGE_TO_ELEVENLABS: dict[str, str] = {
    "ne": "nep",
    "en": "eng",
}


@dataclass
class TranscriptWord:
    """A single word with timing information."""
    word: str
    start: float
    end: float
    speaker_id: str = ""

    @property
    def duration(self) -> float:
        return self.end - self.start


@dataclass
class TranscriptSegment:
    """A sentence or phrase with start/end times."""
    id: int
    text: str
    start: float
    end: float
    avg_logprob: float = 0.0
    no_speech_prob: float = 0.0

    @property
    def is_silence(self) -> bool:
        return self.no_speech_prob > 0.5

    @property
    def confidence(self) -> float:
        return max(0.0, min(1.0, math.exp(self.avg_logprob)))


@dataclass
class TranscriptResult:
    """Full transcription result from ElevenLabs Scribe."""
    full_text: str
    language: str
    duration: float
    words: list[TranscriptWord] = field(default_factory=list)
    segments: list[TranscriptSegment] = field(default_factory=list)
    cost_usd: float = 0.0
    model: str = STT_MODEL

    @property
    def word_count(self) -> int:
        return len(self.words) if self.words else len(self.full_text.split())


def is_elevenlabs_quota_error(message: str) -> bool:
    """True when ElevenLabs rejected a call for insufficient credits (not bad API key)."""
    m = (message or "").lower()
    return (
        "quota" in m
        or "credits remaining" in m
        or "credits are required" in m
        or "insufficient" in m and "credit" in m
    )


def transcription_error_is_retryable(exc: BaseException) -> bool:
    """Celery should not retry billing, auth, or permission failures."""
    msg = str(exc).lower()
    if is_elevenlabs_quota_error(msg):
        return False
    for needle in (
        "invalid_api_key",
        "missing_permissions",
        "detected_unusual_activity",
        "rejected the api key",
    ):
        if needle in msg:
            return False
    return True


def _friendly_elevenlabs_error(exc: ApiError) -> str:
    """Map ElevenLabs API errors to plain English for the UI."""
    body = exc.body if isinstance(exc.body, dict) else {}
    detail = body.get("detail", {}) if isinstance(body, dict) else {}
    status = detail.get("status", "") if isinstance(detail, dict) else ""
    message = detail.get("message", "") if isinstance(detail, dict) else str(exc)

    if is_elevenlabs_quota_error(message):
        return (
            "ElevenLabs credit limit reached: "
            f"{message} "
            "Scene analysis uses OpenAI and does not need more ElevenLabs credits. "
            "Add credits at elevenlabs.io or wait for your quota to reset, then use "
            "Re-transcribe only if you still need a new transcript."
        )

    if status == "invalid_api_key":
        return (
            "ElevenLabs rejected the API key. Use a key from elevenlabs.io that starts "
            "with sk_ and has the speech_to_text permission enabled."
        )
    if status == "missing_permissions":
        return (
            "ElevenLabs API key is missing the speech_to_text permission. "
            "Edit the key in your ElevenLabs dashboard and enable Speech to Text."
        )
    if status == "detected_unusual_activity":
        return (
            "ElevenLabs disabled free-tier transcription for this account "
            "(unusual activity detected). Upgrade to a paid plan or contact ElevenLabs support, "
            "then update ELEVENLABS_API_KEY in .env and restart the worker."
        )
    if exc.status_code == 401:
        return (
            f"ElevenLabs request rejected: {message or 'Check your API key and account limits.'}"
        )
    return f"ElevenLabs transcription failed ({exc.status_code}): {message or exc}"


def _elevenlabs_language_code(language: str) -> str:
    code = (language or "ne").strip().lower()
    return _LANGUAGE_TO_ELEVENLABS.get(code, code)


def _logprob_to_confidence(logprob: float) -> float:
    return max(0.0, min(1.0, math.exp(logprob)))


def _parse_chunk(chunk: Any) -> TranscriptResult:
    """Parse SpeechToTextChunkResponseModel into TranscriptResult."""
    full_text = (getattr(chunk, "text", "") or "").strip()
    lang_raw = getattr(chunk, "language_code", "nep") or "nep"
    language = "ne" if str(lang_raw).lower().startswith("nep") else str(lang_raw)[:10]
    duration = float(getattr(chunk, "audio_duration_secs", 0.0) or 0.0)

    words: list[TranscriptWord] = []
    for raw in getattr(chunk, "words", None) or []:
        wtype = str(getattr(raw, "type", "word"))
        if wtype not in ("word",):
            continue
        text = (getattr(raw, "text", "") or "").strip()
        if not text:
            continue
        start = float(getattr(raw, "start", 0.0) or 0.0)
        end = float(getattr(raw, "end", start) or start)
        if end < start:
            end = start + 0.05
        words.append(TranscriptWord(
            word=text,
            start=start,
            end=end,
            speaker_id=str(getattr(raw, "speaker_id", "") or ""),
        ))

    if duration <= 0 and words:
        duration = max(w.end for w in words)

    segments = _build_segments_from_words(words)
    return TranscriptResult(
        full_text=full_text,
        language=language,
        duration=duration,
        words=words,
        segments=segments,
        model=STT_MODEL,
    )


def _build_segments_from_words(words: list[TranscriptWord]) -> list[TranscriptSegment]:
    """Group words into phrase-level segments for confidence / silence heuristics."""
    if not words:
        return []

    segments: list[TranscriptSegment] = []
    buf: list[TranscriptWord] = []
    seg_id = 0
    gap_threshold = 0.85

    def flush() -> None:
        nonlocal seg_id, buf
        if not buf:
            return
        text = " ".join(w.word for w in buf).strip()
        if not text:
            buf = []
            return
        logprobs = [_logprob_to_confidence(-0.15)]  # default when no per-word logprob stored
        segments.append(TranscriptSegment(
            id=seg_id,
            text=text,
            start=buf[0].start,
            end=buf[-1].end,
            avg_logprob=sum(logprobs) / len(logprobs) if logprobs else -0.3,
            no_speech_prob=0.0,
        ))
        seg_id += 1
        buf = []

    prev_end = words[0].start
    for w in words:
        if buf and (w.start - prev_end) >= gap_threshold:
            flush()
        buf.append(w)
        prev_end = w.end
    flush()
    return segments


def _unwrap_convert_response(response: Any) -> Any:
    """ElevenLabs returns a union; we use the first channel for multichannel."""
    transcripts = getattr(response, "transcripts", None)
    if transcripts:
        return transcripts[0]
    return response


# OpenAI Whisper fallback pricing — $0.006 per minute of audio
OPENAI_STT_COST_PER_SECOND_USD = 0.006 / 60.0


def _transcribe_openai_whisper(
    audio_path: Path,
    language: str = "ne",
) -> TranscriptResult:
    """
    Fallback STT via OpenAI whisper-1 (Fallback Guarantee Law).

    Used when ElevenLabs rejects the call for billing/quota reasons so an
    exhausted Scribe quota degrades to a slower/cheaper provider instead of
    a hard pipeline stop. Word-level timestamps preserved.
    """
    from openai import OpenAI

    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    start_time = time.perf_counter()

    with open(audio_path, "rb") as audio_file:
        response = client.audio.transcriptions.create(
            file=audio_file,
            model="whisper-1",
            language=language,
            response_format="verbose_json",
            timestamp_granularities=["word", "segment"],
        )

    words = [
        TranscriptWord(
            word=str(getattr(w, "word", "")).strip(),
            start=float(getattr(w, "start", 0.0)),
            end=float(getattr(w, "end", 0.0)),
        )
        for w in (getattr(response, "words", None) or [])
        if str(getattr(w, "word", "")).strip()
    ]
    segments = [
        TranscriptSegment(
            id=i,
            text=str(getattr(s, "text", "")).strip(),
            start=float(getattr(s, "start", 0.0)),
            end=float(getattr(s, "end", 0.0)),
            avg_logprob=float(getattr(s, "avg_logprob", 0.0)),
            no_speech_prob=float(getattr(s, "no_speech_prob", 0.0)),
        )
        for i, s in enumerate(getattr(response, "segments", None) or [])
    ]
    duration = float(getattr(response, "duration", 0.0) or 0.0)
    if not duration and words:
        duration = words[-1].end

    result = TranscriptResult(
        full_text=str(getattr(response, "text", "") or ""),
        language=str(getattr(response, "language", language) or language),
        duration=duration,
        words=words,
        segments=segments,
        cost_usd=duration * OPENAI_STT_COST_PER_SECOND_USD,
        model="whisper-1",
    )

    log.info(
        "openai_whisper_fallback_complete",
        duration_audio_s=round(result.duration, 1),
        elapsed_s=round(time.perf_counter() - start_time, 1),
        word_count=result.word_count,
        language_detected=result.language,
        cost_usd=round(result.cost_usd, 6),
    )
    return result


def transcribe_audio(
    audio_path: Path,
    language: str = "ne",
    prompt: Optional[str] = None,
) -> TranscriptResult:
    """
    Transcribe an audio file using ElevenLabs Scribe.

    Falls back to OpenAI whisper-1 when ElevenLabs rejects the request for
    quota/billing reasons and OPENAI_API_KEY is configured.

    Args:
        audio_path: Path to audio (MP3, WAV, M4A, etc.).
        language:   App language code — default "ne" (Nepali).
        prompt:     Optional keyterm hints (previous transcript snippet on regenerate).

    Raises:
        ValueError:   If ELEVENLABS_API_KEY is not configured.
        RuntimeError: If the API returns an error.
    """
    if not settings.ELEVENLABS_API_KEY:
        raise ValueError(
            "ELEVENLABS_API_KEY is not set. "
            "Add it to your .env file: ELEVENLABS_API_KEY=sk_..."
        )

    client = ElevenLabs(api_key=settings.ELEVENLABS_API_KEY)
    language_code = _elevenlabs_language_code(language)

    keyterms = list(NEPALI_DEFAULT_KEYTERMS)
    if prompt:
        snippet = prompt.replace(NEPALI_REGENERATE_PROMPT_PREFIX, "").strip()
        for token in snippet.split()[:40]:
            t = token.strip(".,;:!?\"'()[]")
            if len(t) >= 2 and t not in keyterms:
                keyterms.append(t)
        keyterms = keyterms[:100]

    log.info(
        "elevenlabs_stt_starting",
        file=audio_path.name,
        size_mb=round(audio_path.stat().st_size / 1e6, 2),
        language=language,
        language_code=language_code,
        model=STT_MODEL,
    )

    start_time = time.perf_counter()

    try:
        with open(audio_path, "rb") as audio_file:
            response = client.speech_to_text.convert(
                file=audio_file,
                model_id=STT_MODEL,
                language_code=language_code,
                timestamps_granularity="word",
                tag_audio_events=False,
                diarize=False,
                keyterms=keyterms if keyterms else None,
            )
    except ApiError as exc:
        friendly = _friendly_elevenlabs_error(exc)
        if is_elevenlabs_quota_error(friendly) and settings.OPENAI_API_KEY:
            log.warning(
                "elevenlabs_quota_falling_back_to_openai",
                file=audio_path.name,
                detail=friendly[:200],
            )
            return _transcribe_openai_whisper(audio_path, language=language)
        raise RuntimeError(friendly) from exc

    elapsed = time.perf_counter() - start_time
    chunk = _unwrap_convert_response(response)
    result = _parse_chunk(chunk)
    result.cost_usd = result.duration * STT_COST_PER_SECOND_USD

    log.info(
        "elevenlabs_stt_complete",
        duration_audio_s=round(result.duration, 1),
        elapsed_s=round(elapsed, 1),
        word_count=result.word_count,
        language_detected=result.language,
        cost_usd=round(result.cost_usd, 6),
    )

    return result


def merge_chunk_results(results: list[TranscriptResult], offsets: list[float]) -> TranscriptResult:
    """Merge chunk results when long audio was split before upload."""
    if not results:
        return TranscriptResult(full_text="", language="ne", duration=0.0)

    if len(results) == 1:
        return results[0]

    merged_text = " ".join(r.full_text for r in results if r.full_text)
    merged_words: list[TranscriptWord] = []
    merged_segments: list[TranscriptSegment] = []
    total_duration = 0.0
    total_cost = 0.0
    seg_id = 0

    for result, offset in zip(results, offsets):
        for w in result.words:
            merged_words.append(TranscriptWord(
                word=w.word,
                start=w.start + offset,
                end=w.end + offset,
                speaker_id=w.speaker_id,
            ))
        for s in result.segments:
            merged_segments.append(TranscriptSegment(
                id=seg_id,
                text=s.text,
                start=s.start + offset,
                end=s.end + offset,
                avg_logprob=s.avg_logprob,
                no_speech_prob=s.no_speech_prob,
            ))
            seg_id += 1
        total_duration += result.duration
        total_cost += result.cost_usd

    return TranscriptResult(
        full_text=merged_text,
        language=results[0].language,
        duration=total_duration,
        words=_dedupe_overlap_words(merged_words),
        segments=merged_segments,
        cost_usd=total_cost,
        model=results[0].model,
    )


def _dedupe_overlap_words(
    words: list[TranscriptWord],
    overlap_tolerance: float = 0.05,
) -> list[TranscriptWord]:
    if len(words) < 2:
        return words

    deduped: list[TranscriptWord] = [words[0]]
    for w in words[1:]:
        prev = deduped[-1]
        if (
            w.word.strip() == prev.word.strip()
            and abs(w.start - prev.start) < overlap_tolerance
        ):
            continue
        deduped.append(w)
    return deduped


def build_regenerate_prompt(previous_text: str, max_chars: int = 400) -> str:
    """Hint text for re-transcription — passed as ElevenLabs keyterms."""
    snippet = previous_text.strip()[:max_chars]
    return f"{NEPALI_REGENERATE_PROMPT_PREFIX}{snippet}"
