"""
ViraEdit — Transcription Celery task.

Pipeline:
    1. Load asset from DB → verify status = uploaded
    2. Download source file from MinIO to a temp directory
    3. Extract 16kHz mono MP3 via FFmpeg
    4. Split into chunks if very large (local limit)
    5. Transcribe each chunk with ElevenLabs Scribe (language="ne")
    6. Merge results and store Transcript + words/segments JSON in DB
    7. Update asset duration + status = analyzing (ready for AI scene detection)
    8. Log STT API cost to costs table

Error handling:
    - If ElevenLabs API fails: retry up to 3 times with 30s delay
    - After 3 retries: set asset status = error with user-friendly message
    - Temp files always cleaned up (even on failure)

Windows note:
    This task runs in --pool=solo so it blocks the worker process.
    That is fine — STT API calls are I/O bound, not CPU bound.
    Never use multiprocessing inside this task on Windows.
"""
from __future__ import annotations

import json
import tempfile
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import text

import structlog
from celery import Task

from celery_app import celery_app
from config import settings
from ws.events import PipelineStage
from ws.publisher import emit_pipeline_error, emit_pipeline_progress

log = structlog.get_logger("viraedit.tasks.transcribe")


def _load_asset_transcript_state(
    conn: Any,
    asset_id: str,
) -> tuple[str, str, str]:
    """Return (asset_status, full_text, project_id) for idempotency checks."""
    row = conn.execute(
        text("""
            SELECT a.status, COALESCE(t.full_text, ''), a.project_id::text
            FROM assets a
            LEFT JOIN transcripts t ON t.asset_id = a.id
            WHERE a.id = :id
        """),
        {"id": asset_id},
    ).fetchone()
    if row is None:
        return "", "", ""
    return str(row[0] or ""), str(row[1] or ""), str(row[2] or "")


def _queue_analysis(asset_id: str) -> None:
    try:
        celery_app.send_task(
            "tasks.analyze.run",
            kwargs={"asset_id": asset_id, "scope": "all"},
            queue="analysis",
        )
        log.info("analysis_queued", asset_id=asset_id)
    except Exception as exc:
        log.warning(
            "analysis_queue_failed",
            asset_id=asset_id,
            error=str(exc),
            hint="Start the Celery worker with: scripts\\worker.bat all",
        )


def _serialize_chunk_result(result: Any) -> dict[str, Any]:
    from tasks.whisper import TranscriptResult

    if not isinstance(result, TranscriptResult):
        return {}
    return {
        "full_text": result.full_text,
        "language": result.language,
        "duration": result.duration,
        "cost_usd": result.cost_usd,
        "model": result.model,
        "words": [
            {"word": w.word, "start": w.start, "end": w.end}
            for w in result.words
        ],
        "segments": [
            {
                "start": s.start,
                "end": s.end,
                "avg_logprob": s.avg_logprob,
                "no_speech_prob": s.no_speech_prob,
                "text": s.text,
            }
            for s in result.segments
        ],
    }


def _deserialize_chunk_result(data: dict[str, Any]) -> Any:
    from tasks.whisper import TranscriptResult, TranscriptSegment, TranscriptWord

    words = [
        TranscriptWord(
            word=w["word"],
            start=float(w["start"]),
            end=float(w["end"]),
        )
        for w in data.get("words", [])
    ]
    segments = [
        TranscriptSegment(
            id=i,
            text=s.get("text", ""),
            start=float(s["start"]),
            end=float(s["end"]),
            avg_logprob=float(s.get("avg_logprob", 0.0)),
            no_speech_prob=float(s.get("no_speech_prob", 0.0)),
        )
        for i, s in enumerate(data.get("segments", []))
    ]
    return TranscriptResult(
        full_text=data.get("full_text", ""),
        language=data.get("language", "ne"),
        duration=float(data.get("duration", 0.0)),
        words=words,
        segments=segments,
        cost_usd=float(data.get("cost_usd", 0.0)),
        model=data.get("model", ""),
    )


def _load_stt_progress(engine: Any, asset_id: str) -> dict[str, Any]:
    from sqlalchemy import text

    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT quality_metrics FROM transcripts WHERE asset_id = :id"),
            {"id": asset_id},
        ).fetchone()
    if not row or not row[0]:
        return {}
    qm = row[0] if isinstance(row[0], dict) else {}
    return qm.get("stt_progress") or {}


def _persist_partial_transcription(
    engine: Any,
    asset_id: str,
    merged: Any,
    chunks_done: int,
    total_chunks: int,
    chunk_payloads: list[dict[str, Any]],
    base_quality: dict[str, Any] | None = None,
) -> None:
    """Save in-progress STT so a failed run can resume without re-billing completed chunks."""
    from sqlalchemy import text
    from tasks.transcript_enrich import enrich_transcript_for_storage
    from tasks.transcript_quality import compute_transcript_quality

    raw_words = [
        {"word": w.word, "start": w.start, "end": w.end}
        for w in merged.words
    ]
    seg_dicts = [
        {"start": s.start, "end": s.end, "avg_logprob": s.avg_logprob}
        for s in merged.segments
    ]
    enriched_words, speakers_meta = enrich_transcript_for_storage(raw_words, seg_dicts)
    quality_metrics = dict(base_quality or {})
    quality_metrics.update(compute_transcript_quality(enriched_words, seg_dicts))
    quality_metrics["stt_progress"] = {
        "completed_chunks": chunks_done,
        "total_chunks": total_chunks,
        "chunk_payloads": chunk_payloads,
        "complete": chunks_done >= total_chunks,
    }

    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO transcripts (
                    id, asset_id, full_text, language,
                    words, speakers, status, model_used, cost_usd,
                    quality_metrics, created_at, updated_at
                ) VALUES (
                    :id, :asset_id, :full_text, :language,
                    CAST(:words AS jsonb), CAST(:speakers AS jsonb), 'PROCESSING', :model_used, :cost_usd,
                    CAST(:quality_metrics AS jsonb), NOW(), NOW()
                )
                ON CONFLICT (asset_id) DO UPDATE SET
                    full_text       = EXCLUDED.full_text,
                    language        = EXCLUDED.language,
                    words           = EXCLUDED.words,
                    speakers        = EXCLUDED.speakers,
                    status          = 'PROCESSING',
                    model_used      = EXCLUDED.model_used,
                    cost_usd        = EXCLUDED.cost_usd,
                    quality_metrics = EXCLUDED.quality_metrics,
                    updated_at      = NOW()
            """),
            {
                "id": str(uuid.uuid4()),
                "asset_id": asset_id,
                "full_text": merged.full_text,
                "language": (settings.WHISPER_LANGUAGE or "ne")[:10],
                "words": json.dumps(enriched_words, ensure_ascii=False),
                "speakers": json.dumps(speakers_meta, ensure_ascii=False),
                "model_used": merged.model,
                "cost_usd": round(merged.cost_usd, 6),
                "quality_metrics": json.dumps(quality_metrics, ensure_ascii=False),
            },
        )


def _mark_transcription_failed(
    engine: Any,
    asset_id: str,
    project_id: str,
    user_msg: str,
) -> bool:
    """
    Set asset to ERROR unless transcription already finished (analyzing/ready).

    Returns True if status was updated to ERROR.
    """
    with engine.begin() as conn:
        status, full_text, _ = _load_asset_transcript_state(conn, asset_id)
        st = (status or "").upper()
        if st in ("ANALYZING", "READY") or (full_text or "").strip():
            log.warning(
                "transcription_failure_ignored_asset_advanced",
                asset_id=asset_id,
                status=status,
                has_transcript=bool((full_text or "").strip()),
                error=user_msg[:200],
            )
            return False

        conn.execute(
            text(
                "UPDATE assets SET status='ERROR', error_message=:msg, updated_at=NOW() "
                "WHERE id=:id"
            ),
            {"id": asset_id, "msg": user_msg},
        )

    emit_pipeline_error(
        project_id,
        asset_id,
        stage=PipelineStage.TRANSCRIPTION.value,
        message=user_msg,
    )
    return True


# ── Task ──────────────────────────────────────────────────────────────────────

@celery_app.task(
    name="tasks.transcribe.run",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    queue="transcription",
    # Soft time limit 30min (audio extraction + STT) — hard limit 35min
    soft_time_limit=1800,
    time_limit=2100,
)
def transcribe_asset(self: Task, asset_id: str, force: bool = False) -> dict[str, Any]:
    """
    Transcribe a ViraEdit asset using ElevenLabs Scribe.

    Args:
        asset_id: UUID string of the Asset to transcribe.
        force:    When True, re-transcribe even if already processed (regenerate flow).

    Returns:
        dict with transcript_id, word_count, duration_s, cost_usd.
    """
    import asyncio
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import Session

    # Use sync SQLAlchemy in Celery — asyncpg is not safe in Celery workers
    sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    engine = create_engine(sync_url, pool_pre_ping=True)

    log.info("transcription_task_started", asset_id=asset_id)

    skip_stt_existing_transcript = False

    with engine.begin() as conn:
        # 1. Load asset
        row = conn.execute(
            text("SELECT id, project_id, storage_key, mime_type, status FROM assets WHERE id = :id"),
            {"id": asset_id},
        ).fetchone()

        if row is None:
            log.error("transcription_asset_not_found", asset_id=asset_id)
            return {"error": "Asset not found", "asset_id": asset_id}

        asset_status = row.status
        storage_key = row.storage_key
        project_id = str(row.project_id)

        # Only transcribe uploaded assets unless force-regenerating.
        allowed = {"UPLOADED", "ERROR"}
        if force:
            allowed |= {"READY", "ANALYZING", "TRANSCRIBING"}

        asset_status, existing_text, _ = _load_asset_transcript_state(conn, asset_id)

        if (asset_status or "").upper() not in allowed:
            log.warning(
                "transcription_skipped_wrong_status",
                asset_id=asset_id,
                status=asset_status,
                force=force,
            )
            return {"skipped": True, "status": asset_status}

        if not force and (existing_text or "").strip():
            st = (asset_status or "").upper()
            if st in ("ANALYZING", "READY"):
                log.info(
                    "transcription_skipped_already_complete",
                    asset_id=asset_id,
                    status=asset_status,
                )
                return {
                    "skipped": True,
                    "reason": "already_transcribed",
                    "status": asset_status,
                }
            if st == "ERROR":
                log.info(
                    "transcription_recovering_from_error",
                    asset_id=asset_id,
                )
                conn.execute(
                    text("""
                        UPDATE assets SET
                            status = 'ANALYZING',
                            error_message = NULL,
                            updated_at = NOW()
                        WHERE id = :id
                    """),
                    {"id": asset_id},
                )
                skip_stt_existing_transcript = True

        previous_text = ""
        if force:
            prev = conn.execute(
                text("SELECT full_text FROM transcripts WHERE asset_id = :id"),
                {"id": asset_id},
            ).fetchone()
            if prev and prev[0]:
                previous_text = str(prev[0])
            conn.execute(text("DELETE FROM scenes WHERE asset_id = :id"), {"id": asset_id})
            conn.execute(text("DELETE FROM suggestions WHERE asset_id = :id"), {"id": asset_id})
            conn.execute(text("DELETE FROM shorts WHERE asset_id = :id"), {"id": asset_id})

        # Claim work: only one transcribe run per asset (avoids duplicate ElevenLabs calls).
        if not skip_stt_existing_transcript:
            if force:
                conn.execute(
                    text(
                        "UPDATE assets SET status = 'TRANSCRIBING', error_message = NULL, "
                        "updated_at = NOW() WHERE id = :id"
                    ),
                    {"id": asset_id},
                )
            else:
                claimed = conn.execute(
                    text("""
                        UPDATE assets SET status = 'TRANSCRIBING', error_message = NULL,
                            updated_at = NOW()
                        WHERE id = :id AND UPPER(status::text) IN ('UPLOADED', 'ERROR')
                        RETURNING id
                    """),
                    {"id": asset_id},
                ).fetchone()
                if claimed is None:
                    log.info(
                        "transcription_skipped_not_claimed",
                        asset_id=asset_id,
                        status=asset_status,
                    )
                    return {"skipped": True, "status": asset_status, "reason": "not_claimed"}

    if skip_stt_existing_transcript:
        _queue_analysis(asset_id)
        return {
            "recovered": True,
            "asset_id": asset_id,
            "reason": "transcript_exists_requeued_analysis",
        }

    emit_pipeline_progress(
        project_id,
        asset_id,
        stage=PipelineStage.TRANSCRIPTION.value,
        asset_status="transcribing",
        progress_percent=10,
    )

    with tempfile.TemporaryDirectory(prefix="viraedit_") as tmp_dir:
        tmp_path = Path(tmp_dir)

        try:
            # 3. Download file from MinIO
            source_path = _download_from_minio(storage_key, tmp_path)

            # 4. Extract audio (skip for audio-only files)
            from tasks.audio import extract_audio, get_audio_duration, split_audio_if_needed

            if _is_video(storage_key):
                audio_path = extract_audio(source_path, output_dir=tmp_path)
            else:
                # Already audio — use as-is
                audio_path = source_path

            # Measure duration via FFprobe
            duration_secs = get_audio_duration(audio_path) or 0.0

            # 5. Split if too large for upload
            chunks = split_audio_if_needed(audio_path, output_dir=tmp_path)

            # 6. Transcribe each chunk
            from tasks.whisper import (
                build_regenerate_prompt,
                merge_chunk_results,
                transcribe_audio,
                TranscriptResult,
            )

            stt_keyterm_prompt = (
                build_regenerate_prompt(previous_text) if previous_text else None
            )

            results: list[TranscriptResult] = []
            offsets: list[float] = []
            chunk_payloads: list[dict[str, Any]] = []
            start_chunk_idx = 0

            if not force:
                progress = _load_stt_progress(engine, asset_id)
                saved_payloads = progress.get("chunk_payloads") or []
                if saved_payloads and progress.get("total_chunks") == len(chunks):
                    for payload in saved_payloads:
                        chunk_payloads.append(payload)
                        results.append(_deserialize_chunk_result(payload))
                    start_chunk_idx = len(results)
                    offsets = []
                    running_offset = 0.0
                    for r in results:
                        offsets.append(running_offset)
                        running_offset += r.duration
                    log.info(
                        "transcription_resuming",
                        asset_id=asset_id,
                        completed_chunks=start_chunk_idx,
                        total_chunks=len(chunks),
                    )
                elif saved_payloads:
                    log.warning(
                        "stt_progress_chunk_mismatch",
                        asset_id=asset_id,
                        saved_total=progress.get("total_chunks"),
                        current_total=len(chunks),
                    )

            if results:
                running_offset = offsets[-1] + results[-1].duration
            else:
                running_offset = 0.0

            for chunk_idx, chunk in enumerate(chunks):
                if chunk_idx < start_chunk_idx:
                    continue
                log.info(
                    "transcribing_chunk",
                    chunk=chunk.name,
                    offset_s=running_offset,
                    index=chunk_idx + 1,
                    total=len(chunks),
                )
                result = transcribe_audio(
                    chunk,
                    language=settings.WHISPER_LANGUAGE,
                    prompt=stt_keyterm_prompt,
                )
                results.append(result)
                offsets.append(running_offset)
                running_offset += result.duration
                chunk_payloads.append(_serialize_chunk_result(result))

                partial = merge_chunk_results(results, offsets)
                _persist_partial_transcription(
                    engine,
                    asset_id,
                    partial,
                    chunks_done=len(results),
                    total_chunks=len(chunks),
                    chunk_payloads=chunk_payloads,
                )

            # 7. Merge chunks → single transcript
            transcript = merge_chunk_results(results, offsets)

            # Update duration from STT (more accurate than FFprobe for some formats)
            if transcript.duration > 0:
                duration_secs = transcript.duration

        except Exception as exc:
            log.error(
                "transcription_failed",
                asset_id=asset_id,
                error=str(exc),
                exc_info=True,
            )
            # Update asset status → error
            user_msg = str(exc).strip()[:1900]
            if not user_msg or len(user_msg) < 8:
                user_msg = (
                    "Transcription failed. Please check your audio is clear "
                    "and try again."
                )

            from tasks.whisper import transcription_error_is_retryable

            _mark_transcription_failed(engine, asset_id, project_id, user_msg)

            if (
                transcription_error_is_retryable(exc)
                and self.request.retries < self.max_retries
            ):
                raise self.retry(exc=exc)
            return {"error": str(exc), "asset_id": asset_id}

    # 8. Persist transcript + words to DB.
    # The transcripts table stores word-level timestamps in `words` (jsonb);
    # there is no `project_id` or `segments` column. `status` is a NOT NULL
    # enum (PENDING/PROCESSING/READY/ERROR) — set to READY now that the
    # transcript is complete.
    transcript_id = str(uuid.uuid4())
    raw_words = [
        {"word": w.word, "start": w.start, "end": w.end}
        for w in transcript.words
    ]
    seg_dicts = [
        {"start": s.start, "end": s.end, "avg_logprob": s.avg_logprob}
        for s in transcript.segments
    ]
    from tasks.transcript_enrich import enrich_transcript_for_storage
    from tasks.transcript_quality import compute_transcript_quality

    enriched_words, speakers_meta = enrich_transcript_for_storage(raw_words, seg_dicts)
    quality_metrics = compute_transcript_quality(enriched_words, seg_dicts)
    quality_metrics.pop("stt_progress", None)
    words_json = json.dumps(enriched_words, ensure_ascii=False)
    speakers_json = json.dumps(speakers_meta, ensure_ascii=False)
    quality_json = json.dumps(quality_metrics, ensure_ascii=False)

    with engine.begin() as conn:
        # Insert transcript record
        conn.execute(
            text("""
                INSERT INTO transcripts (
                    id, asset_id, full_text, language,
                    words, speakers, status, model_used, cost_usd,
                    quality_metrics, created_at, updated_at
                ) VALUES (
                    :id, :asset_id, :full_text, :language,
                    CAST(:words AS jsonb), CAST(:speakers AS jsonb), 'READY', :model_used, :cost_usd,
                    CAST(:quality_metrics AS jsonb), NOW(), NOW()
                )
                ON CONFLICT (asset_id) DO UPDATE SET
                    full_text        = EXCLUDED.full_text,
                    language         = EXCLUDED.language,
                    words            = EXCLUDED.words,
                    speakers         = EXCLUDED.speakers,
                    status           = 'READY',
                    model_used       = EXCLUDED.model_used,
                    cost_usd         = EXCLUDED.cost_usd,
                    quality_metrics  = EXCLUDED.quality_metrics,
                    updated_at       = NOW()
            """),
            {
                "id": transcript_id,
                "asset_id": asset_id,
                "full_text": transcript.full_text,
                "language": (settings.WHISPER_LANGUAGE or "ne")[:10],
                "words": words_json,
                "speakers": speakers_json,
                "model_used": transcript.model,
                "cost_usd": round(transcript.cost_usd, 6),
                "quality_metrics": quality_json,
            },
        )

        # Update asset: duration + status → analyzing
        conn.execute(
            text("""
                UPDATE assets SET
                    duration_seconds = :duration,
                    status = 'ANALYZING',
                    error_message = NULL,
                    updated_at = NOW()
                WHERE id = :id
            """),
            {"duration": duration_secs, "id": asset_id},
        )

        # Log STT cost
        conn.execute(
            text("""
                INSERT INTO costs (
                    id, project_id, asset_id, model, task,
                    audio_seconds, cost_usd, created_at, updated_at
                ) VALUES (
                    :id, :project_id, :asset_id, :model, 'transcription',
                    :audio_seconds, :cost_usd, NOW(), NOW()
                )
            """),
            {
                "id": str(uuid.uuid4()),
                "project_id": project_id,
                "asset_id": asset_id,
                "model": transcript.model,
                "audio_seconds": round(duration_secs, 2),
                "cost_usd": round(transcript.cost_usd, 6),
            },
        )

    log.info(
        "transcription_complete",
        asset_id=asset_id,
        transcript_id=transcript_id,
        word_count=transcript.word_count,
        duration_s=round(duration_secs, 1),
        cost_usd=round(transcript.cost_usd, 6),
        language=transcript.language,
    )

    emit_pipeline_progress(
        project_id,
        asset_id,
        stage=PipelineStage.SCENE_DETECTION.value,
        asset_status="analyzing",
        progress_percent=35,
        message="Transcription complete. Finding chapters...",
    )

    # Queue AI scene analysis (EP-2.2) — OpenAI, not ElevenLabs
    _queue_analysis(asset_id)

    return {
        "transcript_id": transcript_id,
        "word_count": transcript.word_count,
        "duration_s": round(duration_secs, 1),
        "cost_usd": round(transcript.cost_usd, 6),
        "language": transcript.language,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _download_from_minio(storage_key: str, dest_dir: Path) -> Path:
    """
    Download an object from MinIO to a local temp file.

    Uses boto3 (synchronous) — safe to call from Celery workers.
    """
    import boto3
    from botocore.config import Config

    client = boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
        ),
        region_name="us-east-1",
    )

    # Preserve original filename from storage key
    filename = Path(storage_key).name
    dest_path = dest_dir / filename

    log.info("downloading_from_minio", storage_key=storage_key, dest=filename)

    client.download_file(
        Bucket="viraedit-media",
        Key=storage_key,
        Filename=str(dest_path),
    )

    size_mb = dest_path.stat().st_size / 1e6
    log.info("download_complete", filename=filename, size_mb=round(size_mb, 1))
    return dest_path


def _is_video(storage_key: str) -> bool:
    """Return True if the storage key looks like a video file."""
    ext = Path(storage_key).suffix.lower()
    return ext in {".mp4", ".mov", ".mkv", ".avi", ".webm", ".wmv", ".m4v"}
