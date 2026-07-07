"""Chunked Director signal extraction orchestrator (Phase 12)."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable

from services.director.analysis.plan_chunks import ChunkPlan, plan_chunks
from services.director.analysis.reconcile_diarization import reconcile_diarization
from services.director.analysis.reconcile_topics import reconcile_topics
from services.director.analysis.reconcile_triggers import reconcile_triggers
from services.director.signals.emphasis_scoring import extract_emphasis_moments
from services.director.signals.feature_mention import extract_feature_mentions
from services.director.signals.phrase_spotting import extract_comparisons, extract_cta_phrases
from services.director.signals.scene_classification import classify_scene_segments
from services.director.signals.shot_classification import classify_shots
from services.director.signals.silence_detection import extract_silences, extract_sustained_speech
from services.director.signals.speaker_diarization import extract_speaker_changes
from services.director.signals.stat_extraction import extract_stats
from services.director.signals.topic_segmentation import extract_topic_shifts


def _slice_segments(segments: list[dict], start: float, end: float) -> list[dict]:
    return [
        s
        for s in segments
        if float(s.get("end", 0)) > start and float(s.get("start", 0)) < end
    ]


def _slice_words(words: list[dict], start: float, end: float) -> list[dict]:
    return [
        w
        for w in words
        if float(w.get("end", 0)) > start and float(w.get("start", 0)) < end
    ]


def _slice_audio_frames(
    audio_frames: list[dict] | None,
    start: float,
    end: float,
    *,
    fps: float,
) -> list[dict]:
    if not audio_frames:
        return []
    start_frame = int(start * fps)
    end_frame = int(end * fps)
    return [
        fr
        for fr in audio_frames
        if start_frame <= int(fr.get("frame", 0)) <= end_frame
    ]


def _speaker_embeddings_from_segments(segments: list[dict]) -> dict[str, list[float]]:
    """Build pseudo-embeddings from segment timing for cross-chunk matching."""
    by_speaker: dict[str, list[list[float]]] = {}
    for seg in segments:
        sid = str(seg.get("speakerId", "A"))
        vec = [
            float(seg.get("start", 0)),
            float(seg.get("end", 0)),
            float(seg.get("end", 0)) - float(seg.get("start", 0)),
        ]
        by_speaker.setdefault(sid, []).append(vec)
    return {
        sid: [sum(col) / len(cols) for col in zip(*cols)]
        for sid, cols in by_speaker.items()
        if cols
    }


def _extract_chunk_signals(
    chunk: ChunkPlan,
    *,
    segments: list[dict],
    words: list[dict],
    audio_frames: list[dict] | None,
    fps: float,
    speakers_meta: list[dict] | None,
) -> dict[str, Any]:
    chunk_segments = _slice_segments(segments, chunk.window_start, chunk.window_end)
    chunk_words = _slice_words(words, chunk.window_start, chunk.window_end)
    chunk_audio = _slice_audio_frames(
        audio_frames,
        chunk.window_start,
        chunk.window_end,
        fps=fps,
    )

    speaker_changes = extract_speaker_changes(chunk_words, speakers_meta)
    return {
        "chunk": chunk,
        "speakerChanges": speaker_changes,
        "speakerEmbeddings": _speaker_embeddings_from_segments(speaker_changes),
        "topicShifts": extract_topic_shifts(chunk_segments),
        "stats": extract_stats(chunk_segments),
        "comparisons": extract_comparisons(chunk_segments),
        "emphasisMoments": extract_emphasis_moments(chunk_segments, chunk_audio, fps=fps),
        "ctaPhrases": extract_cta_phrases(chunk_segments),
        "featureMentions": extract_feature_mentions(chunk_segments),
        "sceneSegments": classify_scene_segments(chunk_segments),
        "shotClassifications": classify_shots(chunk_segments),
    }


def extract_director_signals_chunked(
    *,
    segments: list[dict],
    words: list[dict] | None = None,
    duration_seconds: float = 0.0,
    audio_frames: list[dict] | None = None,
    fps: float = 30.0,
    speakers_meta: list[dict] | None = None,
    max_workers: int = 4,
    on_chunk_complete: Callable[[int, float], None] | None = None,
) -> dict[str, Any]:
    """
    Run Director signal modules with chunking for long-form content.

    Returns the same unified payload shape as extract_director_signals.
    """
    word_list = words or _words_from_segments(segments)
    duration = duration_seconds or _infer_duration(segments, word_list)
    chunks = plan_chunks(duration)

    if len(chunks) == 1:
        from services.director.extract_signals import extract_director_signals

        return extract_director_signals(
            segments=segments,
            words=word_list,
            duration_seconds=duration,
            audio_frames=audio_frames,
            fps=fps,
            speakers_meta=speakers_meta,
        )

    chunk_results: list[dict[str, Any]] = []

    def run_one(chunk: ChunkPlan) -> dict[str, Any]:
        result = _extract_chunk_signals(
            chunk,
            segments=segments,
            words=word_list,
            audio_frames=audio_frames,
            fps=fps,
            speakers_meta=speakers_meta,
        )
        if on_chunk_complete:
            on_chunk_complete(chunk.chunk_index, 0.0)
        return result

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(run_one, chunk): chunk for chunk in chunks}
        for future in as_completed(futures):
            chunk_results.append(future.result())

    chunk_results.sort(key=lambda r: r["chunk"].chunk_index)

    speaker_chunk_outputs = [
        (r["chunk"], r["speakerChanges"], r.get("speakerEmbeddings"))
        for r in chunk_results
    ]
    speaker_changes = reconcile_diarization(speaker_chunk_outputs)

    topic_chunk_outputs = [(r["chunk"], r["topicShifts"]) for r in chunk_results]
    topic_shifts = reconcile_topics(topic_chunk_outputs)

    trigger_modules = ("stats", "comparisons", "emphasisMoments", "ctaPhrases", "featureMentions")
    reconciled_triggers: dict[str, list[dict]] = {}
    for module in trigger_modules:
        outputs = [(r["chunk"], r[module]) for r in chunk_results]
        reconciled_triggers[module] = reconcile_triggers(outputs)

    scene_outputs = [(r["chunk"], r["sceneSegments"]) for r in chunk_results]
    scene_segments = reconcile_triggers(scene_outputs)

    shot_outputs = [(r["chunk"], r["shotClassifications"]) for r in chunk_results]
    shot_classifications = reconcile_triggers(shot_outputs)

    silences = extract_silences(word_list)
    sustained = extract_sustained_speech(speaker_changes)

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
        "stats": reconciled_triggers["stats"],
        "comparisons": reconciled_triggers["comparisons"],
        "emphasisMoments": reconciled_triggers["emphasisMoments"],
        "silences": silences,
        "sustainedSpeech": sustained,
        "words": indexed_words,
        "ctaPhrases": reconciled_triggers["ctaPhrases"],
        "featureMentions": reconciled_triggers["featureMentions"],
        "sceneSegments": scene_segments,
        "shotClassifications": shot_classifications,
        "chunked": True,
        "chunkCount": len(chunks),
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
