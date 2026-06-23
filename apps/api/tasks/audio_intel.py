"""
ViraEdit — Audio intelligence from word-level transcript timestamps.

Derives audio events directly from the Whisper word timestamp data —
no extra audio processing needed, just smart analysis of the gaps and words.

Detects:
  Silences        — gaps > SILENCE_THRESHOLD_S between consecutive words
  Filler words    — Nepali + English filler word occurrences with timestamps
  Breath markers  — very-short-duration words that are likely breath sounds
  Low-energy zones — runs of low-confidence words (avg_logprob < threshold)

All detected events are returned as plain dicts suitable for JSON storage.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

# ── Constants ─────────────────────────────────────────────────────────────────

# Gap between words that counts as a silence pause
SILENCE_THRESHOLD_S: float = 0.8

# A word shorter than this is considered a breath or stutter (not real speech)
BREATH_MAX_DURATION_S: float = 0.12

# Nepali filler words — Whisper often transcribes these verbatim
NEPALI_FILLER_WORDS: frozenset[str] = frozenset({
    "उम", "आ", "अ", "ए", "ओ",          # Vocalizations
    "हैन", "हैन र",                      # "Right?" used as filler
    "भनेको", "भन्नु",                   # "That is to say" (overused)
    "के हो", "के हो र",                 # "What is it?" (filler)
    "ठिकै", "ठिकै छ",                   # "OK/fine" (filler)
    "अनि", "अनि त",                     # "And then" (overused)
    "त्यो", "त्यही",                    # "That" (filler placeholder)
})

ENGLISH_FILLER_WORDS: frozenset[str] = frozenset({
    "um", "uh", "uhh", "umm", "hmm",
    "like", "basically", "actually",
    "you know", "i mean", "right",
    "so", "anyway", "literally",
})


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class SilencePause:
    """A gap of silence between two words."""
    start_time: float
    end_time: float
    duration: float
    before_word: str
    after_word: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class FillerOccurrence:
    """A detected filler word with its timestamp."""
    word: str
    start_time: float
    end_time: float
    language: str   # "ne" or "en"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class BreathMarker:
    """A sub-100ms word that is likely a breath or stutter."""
    word: str
    start_time: float
    end_time: float
    duration: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class AudioIntelligenceReport:
    """Full audio analysis result for a transcript."""
    silences: list[SilencePause]
    fillers: list[FillerOccurrence]
    breaths: list[BreathMarker]
    total_silence_s: float
    total_filler_s: float
    filler_count: int
    silence_count: int
    speech_ratio: float     # fraction of total duration that is actual speech

    def to_dict(self) -> dict[str, Any]:
        return {
            "silences": [s.to_dict() for s in self.silences],
            "fillers": [f.to_dict() for f in self.fillers],
            "breaths": [b.to_dict() for b in self.breaths],
            "total_silence_s": round(self.total_silence_s, 2),
            "total_filler_s": round(self.total_filler_s, 2),
            "filler_count": self.filler_count,
            "silence_count": self.silence_count,
            "speech_ratio": round(self.speech_ratio, 3),
        }


# ── Core analysis ─────────────────────────────────────────────────────────────

def _is_filler(word: str) -> tuple[bool, str]:
    """Check if a word is a filler. Returns (is_filler, language)."""
    clean = word.strip().lower()
    if clean in NEPALI_FILLER_WORDS or word.strip() in NEPALI_FILLER_WORDS:
        return True, "ne"
    if clean in ENGLISH_FILLER_WORDS:
        return True, "en"
    return False, ""


def analyze_audio_intelligence(
    words: list[dict[str, Any]],
    total_duration: float,
) -> AudioIntelligenceReport:
    """
    Analyze word-level timestamps from Whisper to detect audio events.

    Args:
        words: List of word dicts. Each must have:
                  word      — the transcribed word string
                  start     — start time in seconds (float)
                  end       — end time in seconds (float)
        total_duration: Total audio duration in seconds.

    Returns:
        AudioIntelligenceReport with all detected events.
    """
    silences: list[SilencePause] = []
    fillers: list[FillerOccurrence] = []
    breaths: list[BreathMarker] = []

    # Sort words by start time (should already be sorted, but be safe)
    sorted_words = sorted(words, key=lambda w: w.get("start", 0))

    for i, word_dict in enumerate(sorted_words):
        w_text = word_dict.get("word", "").strip()
        w_start = float(word_dict.get("start", 0))
        w_end = float(word_dict.get("end", w_start))
        w_dur = w_end - w_start

        # Breath detection
        if 0 < w_dur <= BREATH_MAX_DURATION_S and w_text:
            breaths.append(BreathMarker(
                word=w_text,
                start_time=w_start,
                end_time=w_end,
                duration=round(w_dur, 3),
            ))

        # Filler detection
        is_fill, lang = _is_filler(w_text)
        if is_fill:
            fillers.append(FillerOccurrence(
                word=w_text,
                start_time=w_start,
                end_time=w_end,
                language=lang,
            ))

        # Silence detection (gap between this word and next)
        if i + 1 < len(sorted_words):
            next_word = sorted_words[i + 1]
            next_start = float(next_word.get("start", w_end))
            gap = next_start - w_end
            if gap >= SILENCE_THRESHOLD_S:
                silences.append(SilencePause(
                    start_time=round(w_end, 3),
                    end_time=round(next_start, 3),
                    duration=round(gap, 3),
                    before_word=w_text,
                    after_word=next_word.get("word", "").strip(),
                ))

    total_silence_s = sum(s.duration for s in silences)
    total_filler_s = sum(
        f.end_time - f.start_time for f in fillers
    )

    speech_ratio = 1.0
    if total_duration > 0:
        non_speech = total_silence_s + total_filler_s
        speech_ratio = max(0.0, 1.0 - (non_speech / total_duration))

    return AudioIntelligenceReport(
        silences=silences,
        fillers=fillers,
        breaths=breaths,
        total_silence_s=total_silence_s,
        total_filler_s=total_filler_s,
        filler_count=len(fillers),
        silence_count=len(silences),
        speech_ratio=round(speech_ratio, 3),
    )


# ── Cut planning ─────────────────────────────────────────────────────────────

def plan_silence_cuts(
    report: AudioIntelligenceReport,
    min_duration: float = 1.5,
    keep_breath_room: float = 0.15,
) -> list[dict[str, Any]]:
    """
    Generate a list of cut instructions to remove long silences.

    Args:
        report:          AudioIntelligenceReport from analyze_audio_intelligence().
        min_duration:    Only cut silences longer than this (seconds).
        keep_breath_room: Keep this many seconds at start/end of each silence
                          so the edit breathes naturally.

    Returns:
        List of {start, end, duration, type: "silence_cut"} dicts.
    """
    cuts = []
    for silence in report.silences:
        if silence.duration < min_duration:
            continue
        cut_start = silence.start_time + keep_breath_room
        cut_end = silence.end_time - keep_breath_room
        if cut_end > cut_start:
            cuts.append({
                "type": "silence_cut",
                "start": round(cut_start, 3),
                "end": round(cut_end, 3),
                "duration_saved": round(cut_end - cut_start, 3),
            })
    return cuts


def plan_filler_cuts(
    report: AudioIntelligenceReport,
    group_gap_s: float = 0.3,
) -> list[dict[str, Any]]:
    """
    Group consecutive filler occurrences and plan cuts for each group.

    Args:
        report:      AudioIntelligenceReport.
        group_gap_s: Filler occurrences within this gap are grouped together.

    Returns:
        List of {start, end, words, type: "filler_cut"} dicts.
    """
    if not report.fillers:
        return []

    sorted_fillers = sorted(report.fillers, key=lambda f: f.start_time)
    groups: list[list[FillerOccurrence]] = [[sorted_fillers[0]]]

    for filler in sorted_fillers[1:]:
        last = groups[-1][-1]
        if filler.start_time - last.end_time <= group_gap_s:
            groups[-1].append(filler)
        else:
            groups.append([filler])

    cuts = []
    for group in groups:
        cuts.append({
            "type": "filler_cut",
            "start": round(group[0].start_time, 3),
            "end": round(group[-1].end_time, 3),
            "words": [f.word for f in group],
            "duration_saved": round(
                group[-1].end_time - group[0].start_time, 3
            ),
        })
    return cuts
