"""Director Engine — orchestrates all signal extraction modules."""
from __future__ import annotations

from typing import Any

from services.director.analysis.chunked_extraction import extract_director_signals_chunked
from services.director.signals.emphasis_scoring import extract_emphasis_moments
from services.director.signals.feature_mention import extract_feature_mentions
from services.director.signals.phrase_spotting import extract_comparisons, extract_cta_phrases
from services.director.signals.scene_classification import classify_scene_segments
from services.director.signals.shot_classification import classify_shots
from services.director.signals.silence_detection import extract_silences, extract_sustained_speech
from services.director.signals.speaker_diarization import extract_speaker_changes
from services.director.signals.stat_extraction import extract_stats
from services.director.signals.topic_segmentation import extract_topic_shifts


def extract_director_signals(
    *,
    segments: list[dict],
    words: list[dict] | None = None,
    duration_seconds: float = 0.0,
    audio_frames: list[dict] | None = None,
    fps: float = 30.0,
    speakers_meta: list[dict] | None = None,
    use_chunking: bool = True,
) -> dict[str, Any]:
    """
    Run all Director signal modules and return a unified payload for the TS rule engine.

    Field names use camelCase to match remotion-service DirectorSignals.
    Long-form content (>15 min) uses chunked parallel extraction with reconciliation.
    """
    word_list = words or _words_from_segments(segments)
    duration = duration_seconds or _infer_duration(segments, word_list)

    if use_chunking and duration > 15 * 60:
        return extract_director_signals_chunked(
            segments=segments,
            words=word_list,
            duration_seconds=duration,
            audio_frames=audio_frames,
            fps=fps,
            speakers_meta=speakers_meta,
        )

    speaker_changes = extract_speaker_changes(word_list, speakers_meta)
    topic_shifts = extract_topic_shifts(segments)
    stats = extract_stats(segments)
    comparisons = extract_comparisons(segments)
    emphasis = extract_emphasis_moments(segments, audio_frames, fps=fps)
    silences = extract_silences(word_list)
    sustained = extract_sustained_speech(speaker_changes)
    cta = extract_cta_phrases(segments)
    features = extract_feature_mentions(segments)
    scenes = classify_scene_segments(segments)
    shots = classify_shots(segments)

    indexed_words = [
        {
            "index": i,
            "text": str(w.get("word", w.get("text", ""))),
            "start": float(w.get("start", 0)),
            "end": float(w.get("end", 0)),
        }
        for i, w in enumerate(word_list)
        if w.get("type") != "silence"
    ]

    return {
        "durationSeconds": duration,
        "speakerChanges": speaker_changes,
        "topicShifts": topic_shifts,
        "stats": stats,
        "comparisons": comparisons,
        "emphasisMoments": emphasis,
        "silences": silences,
        "sustainedSpeech": sustained,
        "words": indexed_words,
        "ctaPhrases": cta,
        "featureMentions": features,
        "sceneSegments": scenes,
        "shotClassifications": shots,
    }


def _words_from_segments(segments: list[dict]) -> list[dict]:
    words: list[dict] = []
    for seg in segments:
        seg_words = seg.get("words")
        if isinstance(seg_words, list) and seg_words:
            words.extend(seg_words)
        else:
            text = str(seg.get("text", "")).strip()
            if text:
                words.append(
                    {
                        "word": text,
                        "start": float(seg.get("start", 0)),
                        "end": float(seg.get("end", 0)),
                    }
                )
    return words


def _infer_duration(segments: list[dict], words: list[dict]) -> float:
    ends = [float(s.get("end", 0)) for s in segments if s.get("end") is not None]
    ends += [float(w.get("end", 0)) for w in words if w.get("end") is not None]
    return max(ends) if ends else 0.0
