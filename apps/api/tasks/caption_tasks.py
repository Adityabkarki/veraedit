"""
ViraEdit — Caption Celery tasks (Module 03).

transcribe_task   — STT via ElevenLabs / whisper fallback
render_captions_task — burn ASS captions into video via FFmpeg
"""
from __future__ import annotations

import asyncio
import json
import uuid
from pathlib import Path
from typing import Any

import structlog
from celery import Task
from sqlalchemy import create_engine, text

from celery_app import celery_app
from config import settings
from processors.caption_renderer import segments_from_words, words_to_srt
from processors.storage_helpers import storage_sync
from processors.transcriber import transcribe_video
from services.pipeline_cost import estimate_stt_cost_usd

log = structlog.get_logger("viraedit.tasks.caption")


def _sync_db_url() -> str:
    return settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")


def _update_job_sync(
    job_id: str,
    *,
    status: str | None = None,
    result: dict | None = None,
    error: str | None = None,
) -> None:
    engine = create_engine(_sync_db_url(), pool_pre_ping=True)
    sets: list[str] = []
    params: dict[str, Any] = {"id": job_id}

    if status is not None:
        sets.append("status = :status")
        params["status"] = status
    if result is not None:
        sets.append("result = CAST(:result AS jsonb)")
        params["result"] = json.dumps(result)
    if error is not None:
        sets.append("error = :error")
        params["error"] = error

    if not sets:
        return

    sql = f"UPDATE jobs SET {', '.join(sets)}, updated_at = NOW() WHERE id = :id"
    with engine.begin() as conn:
        conn.execute(text(sql), params)


def _log_stt_cost(project_id: str, audio_seconds: float, model: str = "scribe_v2") -> None:
    engine = create_engine(_sync_db_url(), pool_pre_ping=True)
    cost = estimate_stt_cost_usd(audio_seconds)
    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO costs (
                    id, project_id, model, task, audio_seconds, cost_usd,
                    created_at, updated_at
                ) VALUES (
                    :id, :project_id, :model, 'caption_transcription',
                    :audio_seconds, :cost_usd, NOW(), NOW()
                )
            """),
            {
                "id": str(uuid.uuid4()),
                "project_id": project_id,
                "model": model,
                "audio_seconds": round(audio_seconds, 2),
                "cost_usd": cost,
            },
        )


def _audio_duration_from_words(words: list[dict[str, Any]]) -> float:
    if not words:
        return 0.0
    return float(max(w.get("end", 0) for w in words))


@celery_app.task(bind=True, name="tasks.caption.transcribe")
def transcribe_task(
    self: Task,
    job_id: str,
    video_key: str,
    project_id: str,
    language: str | None = None,
) -> dict[str, Any]:
    _update_job_sync(job_id, status="processing")
    local_path: Path | None = None

    try:
        local_path = storage_sync.download_to_temp(video_key, job_id)
        result = asyncio.run(transcribe_video(local_path, language))
        transcript_key = f"projects/{project_id}/transcripts/{job_id}.json"
        storage_sync.put_object(
            transcript_key,
            json.dumps(result, ensure_ascii=False).encode("utf-8"),
            content_type="application/json",
        )

        segments = result.get("segments") or segments_from_words(result.get("words", []))
        srt_key = f"projects/{project_id}/transcripts/{job_id}.srt"
        storage_sync.put_object(
            srt_key,
            words_to_srt(segments).encode("utf-8"),
            content_type="text/plain; charset=utf-8",
        )

        audio_seconds = _audio_duration_from_words(result.get("words", []))
        if audio_seconds > 0:
            _log_stt_cost(project_id, audio_seconds)

        payload = {
            "transcript_key": transcript_key,
            "srt_key": srt_key,
            "language": result.get("language"),
            "language_warning": result.get("language_warning"),
            "word_count": len(result.get("words", [])),
            "full_text_preview": (result.get("full_text") or "")[:200],
            "words": result.get("words", []),
            "segments": segments,
        }
        _update_job_sync(job_id, status="done", result=payload)
        log.info("caption_transcribe_done", job_id=job_id, word_count=payload["word_count"])
        return payload

    except Exception as exc:
        _update_job_sync(job_id, status="failed", error=str(exc))
        log.error("caption_transcribe_failed", job_id=job_id, error=str(exc))
        raise
    finally:
        if local_path and local_path.exists():
            try:
                local_path.unlink()
            except OSError:
                pass


@celery_app.task(
    bind=True,
    name="tasks.caption.render",
    soft_time_limit=1700,
    time_limit=1800,
)
def render_captions_task(
    self: Task,
    job_id: str,
    video_key: str,
    words: list[dict[str, Any]],
    style: str,
    project_id: str,
) -> dict[str, Any]:
    _update_job_sync(job_id, status="processing")
    local_path: Path | None = None
    out_path: Path | None = None

    try:
        local_path = storage_sync.download_to_temp(video_key, job_id)
        out_path = local_path.with_name(f"{local_path.stem}_captioned_{style}.mp4")
        # Editor burn-in: ASS + FFmpeg only (fast). Remotion v2 is for batch chapter/sizzle flows.
        from processors.caption_renderer import render_captions

        render_captions(local_path, out_path, words, style=style)
        out_key = f"projects/{project_id}/captioned/{job_id}_{style}.mp4"
        storage_sync.put_file(out_key, out_path, content_type="video/mp4")
        signed_url = storage_sync.get_presigned_url(out_key)
        payload = {"output_key": out_key, "url": signed_url, "style": style}
        _update_job_sync(job_id, status="done", result=payload)
        log.info("caption_render_done", job_id=job_id, style=style)
        return payload

    except Exception as exc:
        _update_job_sync(job_id, status="failed", error=str(exc))
        log.error("caption_render_failed", job_id=job_id, error=str(exc))
        raise
    finally:
        for p in (local_path, out_path):
            if p and p.exists():
                try:
                    p.unlink()
                except OSError:
                    pass
