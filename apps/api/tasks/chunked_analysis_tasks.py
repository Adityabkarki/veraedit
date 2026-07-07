"""
Celery tasks for chunked long-form Director signal extraction (Phase 12).

Uses Celery group + chord: each chunk runs in parallel; reconciliation runs once
all chunks for a module complete.
"""
from __future__ import annotations

from typing import Any

import structlog
from celery import chord, group

from celery_app import celery_app
from services.director.analysis.chunked_extraction import extract_director_signals_chunked
from services.director.analysis.plan_chunks import plan_chunks

log = structlog.get_logger("viraedit.tasks.chunked_analysis")


@celery_app.task(name="tasks.chunked_analysis.process_chunk", queue="analysis")
def process_analysis_chunk(
    chunk_plan_dict: dict[str, Any],
    segments: list[dict],
    words: list[dict],
    audio_frames: list[dict] | None,
    fps: float,
    speakers_meta: list[dict] | None,
    project_id: str | None = None,
    job_id: str | None = None,
) -> dict[str, Any]:
    """Extract signals for one chunk window."""
    from services.director.analysis.chunked_extraction import _extract_chunk_signals
    from services.director.analysis.plan_chunks import ChunkPlan

    chunk = ChunkPlan(
        chunk_index=int(chunk_plan_dict["chunkIndex"]),
        core_start=float(chunk_plan_dict["coreStart"]),
        core_end=float(chunk_plan_dict["coreEnd"]),
        window_start=float(chunk_plan_dict["windowStart"]),
        window_end=float(chunk_plan_dict["windowEnd"]),
    )

    raw = _extract_chunk_signals(
        chunk,
        segments=segments,
        words=words,
        audio_frames=audio_frames,
        fps=fps,
        speakers_meta=speakers_meta,
    )
    serializable = {
        "chunkIndex": chunk.chunk_index,
        "chunk": chunk.to_dict(),
        "speakerChanges": raw["speakerChanges"],
        "speakerEmbeddings": raw.get("speakerEmbeddings"),
        "topicShifts": raw["topicShifts"],
        "stats": raw["stats"],
        "comparisons": raw["comparisons"],
        "emphasisMoments": raw["emphasisMoments"],
        "ctaPhrases": raw["ctaPhrases"],
        "featureMentions": raw["featureMentions"],
        "sceneSegments": raw["sceneSegments"],
        "shotClassifications": raw["shotClassifications"],
    }
    log.info(
        "chunked_analysis_chunk_done",
        chunk_index=chunk.chunk_index,
        project_id=project_id,
        job_id=job_id,
    )
    return serializable


@celery_app.task(name="tasks.chunked_analysis.reconcile", queue="analysis")
def reconcile_chunk_results(
    chunk_results: list[dict[str, Any]],
    duration_seconds: float,
    words: list[dict],
) -> dict[str, Any]:
    """Chord callback — merge per-chunk outputs into unified DirectorSignals."""
    from services.director.analysis.plan_chunks import ChunkPlan
    from services.director.analysis.reconcile_diarization import reconcile_diarization
    from services.director.analysis.reconcile_topics import reconcile_topics
    from services.director.analysis.reconcile_triggers import reconcile_triggers
    from services.director.signals.silence_detection import extract_silences, extract_sustained_speech

    chunk_results = sorted(chunk_results, key=lambda r: r.get("chunkIndex", 0))

    def to_plan(r: dict[str, Any]) -> ChunkPlan:
        c = r["chunk"]
        if isinstance(c, ChunkPlan):
            return c
        return ChunkPlan(
            chunk_index=int(c["chunkIndex"] if isinstance(c, dict) else c.chunk_index),
            core_start=float(c["coreStart"] if isinstance(c, dict) else c.core_start),
            core_end=float(c["coreEnd"] if isinstance(c, dict) else c.core_end),
            window_start=float(c["windowStart"] if isinstance(c, dict) else c.window_start),
            window_end=float(c["windowEnd"] if isinstance(c, dict) else c.window_end),
        )

    speaker_outputs = [
        (to_plan(r), r["speakerChanges"], r.get("speakerEmbeddings"))
        for r in chunk_results
    ]
    speaker_changes = reconcile_diarization(speaker_outputs)

    topic_outputs = [(to_plan(r), r["topicShifts"]) for r in chunk_results]
    topic_shifts = reconcile_topics(topic_outputs)

    trigger_modules = ("stats", "comparisons", "emphasisMoments", "ctaPhrases", "featureMentions")
    reconciled: dict[str, list] = {}
    for module in trigger_modules:
        outputs = [(to_plan(r), r[module]) for r in chunk_results]
        reconciled[module] = reconcile_triggers(outputs)

    scene_segments = reconcile_triggers(
        [(to_plan(r), r["sceneSegments"]) for r in chunk_results]
    )
    shot_classifications = reconcile_triggers(
        [(to_plan(r), r["shotClassifications"]) for r in chunk_results]
    )

    silences = extract_silences(words)
    sustained = extract_sustained_speech(speaker_changes)

    indexed_words = [
        {
            "index": i,
            "text": str(w.get("word", w.get("text", ""))),
            "start": float(w.get("start", 0)),
            "end": float(w.get("end", 0)),
        }
        for i, w in enumerate(words)
        if w.get("type") != "silence"
    ]

    return {
        "durationSeconds": duration_seconds,
        "speakerChanges": speaker_changes,
        "topicShifts": topic_shifts,
        "stats": reconciled["stats"],
        "comparisons": reconciled["comparisons"],
        "emphasisMoments": reconciled["emphasisMoments"],
        "silences": silences,
        "sustainedSpeech": sustained,
        "words": indexed_words,
        "ctaPhrases": reconciled["ctaPhrases"],
        "featureMentions": reconciled["featureMentions"],
        "sceneSegments": scene_segments,
        "shotClassifications": shot_classifications,
        "chunked": True,
        "chunkCount": len(chunk_results),
    }


def dispatch_chunked_analysis_async(
    *,
    segments: list[dict],
    words: list[dict],
    duration_seconds: float,
    audio_frames: list[dict] | None = None,
    fps: float = 30.0,
    speakers_meta: list[dict] | None = None,
    project_id: str | None = None,
    job_id: str | None = None,
) -> Any:
    """Dispatch chunked analysis via Celery group + chord."""
    chunks = plan_chunks(duration_seconds)
    if len(chunks) == 1:
        return extract_director_signals_chunked(
            segments=segments,
            words=words,
            duration_seconds=duration_seconds,
            audio_frames=audio_frames,
            fps=fps,
            speakers_meta=speakers_meta,
        )

    chunk_dicts = [c.to_dict() for c in chunks]
    header = group(
        process_analysis_chunk.s(
            plan,
            segments,
            words,
            audio_frames,
            fps,
            speakers_meta,
            project_id,
            job_id,
        )
        for plan in chunk_dicts
    )
    callback = reconcile_chunk_results.s(duration_seconds, words)
    return chord(header)(callback)
