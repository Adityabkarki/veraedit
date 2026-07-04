"""
ViraEdit — Platform shorts extraction Celery task (Phase 03).
"""
from __future__ import annotations

import asyncio
import shutil
import tempfile
from pathlib import Path

import structlog
from celery import Task

from celery_app import celery_app
from processors.shorts_extractor import extract_shorts_for_platforms
from processors.storage_helpers import storage_sync
from processors.transcriber import transcribe_video
from services.job_sync import update_job_sync

log = structlog.get_logger("viraedit.tasks.shorts_extract")

PRESIGNED_EXPIRY_SECONDS = 86400  # 24 hours


def _sync_db_url() -> str:
    from config import settings

    return settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")


def _load_cached_transcript(project_id: str, video_key: str) -> dict | None:
    """Reuse the project transcript when available (avoids a second ElevenLabs STT run)."""
    from sqlalchemy import create_engine, text

    engine = create_engine(_sync_db_url(), pool_pre_ping=True)
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT t.full_text, t.words, t.language, t.quality_metrics
                FROM transcripts t
                JOIN assets a ON a.id = t.asset_id
                WHERE a.project_id = :project_id
                  AND a.storage_key = :video_key
                  AND t.status = 'READY'
                ORDER BY t.updated_at DESC
                LIMIT 1
                """
            ),
            {"project_id": project_id, "video_key": video_key},
        ).mappings().first()

    if not row or not row.get("words"):
        return None

    words = row["words"] or []
    if not words:
        return None

    quality = row.get("quality_metrics") or {}
    segments = quality.get("segments") or []

    log.info(
        "shorts_extract_transcript_cache_hit",
        project_id=project_id,
        word_count=len(words),
    )
    return {
        "full_text": row.get("full_text") or "",
        "language": row.get("language") or "ne",
        "words": words,
        "segments": segments,
    }


@celery_app.task(bind=True, name="tasks.shorts.extract", time_limit=1800)
def extract_shorts_task(
    self: Task,
    job_id: str,
    video_key: str,
    project_id: str,
    platforms: list[str],
    max_clips: int = 5,
) -> dict:
    def progress(step: str, **kwargs) -> None:
        update_job_sync(job_id, status="processing", result={"step": step, **kwargs})

    local_path: Path | None = None
    work_dir: Path | None = None

    try:
        progress("downloading")
        local_path = storage_sync.download_to_temp(video_key, job_id)

        progress("transcribing")
        transcript = _load_cached_transcript(project_id, video_key)
        if transcript is None:
            transcript = asyncio.run(transcribe_video(local_path))
        else:
            progress("transcribing", cached=True)

        progress("finding_and_cutting_moments")
        work_dir = Path(tempfile.gettempdir()) / "viraedit" / job_id / "shorts_work"
        work_dir.mkdir(parents=True, exist_ok=True)

        results = asyncio.run(
            extract_shorts_for_platforms(
                local_path,
                transcript,
                platforms,
                work_dir,
                max_clips,
            )
        )

        progress("uploading_results")
        output: dict[str, list[dict]] = {}
        for platform, clips in results.items():
            output[platform] = []
            for clip in clips:
                clip_id = f"{job_id}_{platform}_{clip['clip_index']}"
                key = f"projects/{project_id}/shorts/{platform}/{clip_id}.mp4"
                storage_sync.put_file(key, Path(clip["local_path"]), "video/mp4")
                url = storage_sync.get_presigned_url(key, expires=PRESIGNED_EXPIRY_SECONDS)
                output[platform].append({
                    "key": key,
                    "url": url,
                    "title": clip["title"],
                    "score": clip["score"],
                    "duration": clip["duration"],
                })

        result = {"shorts": output}
        update_job_sync(job_id, status="done", result=result)
        log.info("shorts_extract_done", job_id=job_id, platforms=platforms)
        return result

    except Exception as exc:
        update_job_sync(job_id, status="failed", error=str(exc))
        log.error("shorts_extract_failed", job_id=job_id, error=str(exc))
        raise
    finally:
        if work_dir and work_dir.exists():
            shutil.rmtree(work_dir, ignore_errors=True)
        if local_path and local_path.exists():
            try:
                local_path.unlink()
            except OSError:
                pass
