"""
ViraEdit — Chapter extraction Celery task (Phase 04).
"""
from __future__ import annotations

import asyncio
import shutil
import tempfile
from pathlib import Path

import structlog
from celery import Task

from celery_app import celery_app
from processors.caption_renderer import render_captions_v2
from processors.chapter_detector import detect_chapters_with_energy
from processors.storage_helpers import storage_sync
from processors.text_editor import apply_cuts, get_duration
from processors.transcriber import transcribe_video
from services.job_sync import update_job_sync

log = structlog.get_logger("viraedit.tasks.chapter_extract")

PRESIGNED_EXPIRY_SECONDS = 86400


@celery_app.task(bind=True, name="tasks.chapters.extract", time_limit=2400)
def extract_chapters_task(
    self: Task,
    job_id: str,
    video_key: str,
    project_id: str,
    min_chapter_duration: float = 60.0,
    caption_style: str = "minimal",
) -> dict:
    def progress(step: str, **kwargs) -> None:
        update_job_sync(job_id, status="processing", result={"step": step, **kwargs})

    local_path: Path | None = None
    work_dir: Path | None = None

    try:
        progress("downloading")
        local_path = storage_sync.download_to_temp(video_key, job_id)

        progress("transcribing")
        transcript = asyncio.run(transcribe_video(local_path))

        progress("detecting_chapters")
        chapters = asyncio.run(
            detect_chapters_with_energy(
                local_path,
                transcript,
                min_chapter_duration,
                project_id=project_id,
                job_id=job_id,
                workspace_id=project_id,
            )
        )

        total_duration = get_duration(local_path)
        output_chapters: list[dict] = []
        work_dir = Path(tempfile.gettempdir()) / "viraedit" / job_id / "chapters_work"
        work_dir.mkdir(parents=True, exist_ok=True)

        for i, ch in enumerate(chapters):
            progress("cutting_chapter", done=i, total=len(chapters))
            chapter_dir = work_dir / f"ch_{i}"
            chapter_dir.mkdir(parents=True, exist_ok=True)

            raw_path = chapter_dir / "raw.mp4"
            cuts: list[dict[str, float]] = []
            if float(ch["start"]) > 0.1:
                cuts.append({"start": 0.0, "end": float(ch["start"])})
            if float(ch["end"]) < total_duration - 0.1:
                cuts.append({"start": float(ch["end"]), "end": total_duration})
            apply_cuts(local_path, raw_path, cuts)

            captioned_path = chapter_dir / "captioned.mp4"
            offset = float(ch["start"])
            chapter_words = [
                {
                    **w,
                    "start": round(float(w["start"]) - offset, 3),
                    "end": round(float(w["end"]) - offset, 3),
                }
                for w in transcript.get("words", [])
                if float(w.get("start", 0)) >= float(ch["start"])
                and float(w.get("end", 0)) <= float(ch["end"]) + 0.5
            ]
            final_path = raw_path
            if chapter_words:
                try:
                    asyncio.run(
                        render_captions_v2(
                            raw_path, captioned_path, chapter_words, style=caption_style
                        )
                    )
                    final_path = captioned_path
                except Exception as exc:
                    log.warning("chapter_caption_failed", chapter=i, error=str(exc))

            chapter_key = f"projects/{project_id}/chapters/{job_id}_ch{i}.mp4"
            storage_sync.put_file(chapter_key, final_path, "video/mp4")
            url = storage_sync.get_presigned_url(chapter_key, expires=PRESIGNED_EXPIRY_SECONDS)

            output_chapters.append({
                "index": i,
                "title": ch.get("title", f"Chapter {i + 1}"),
                "summary": ch.get("summary", ""),
                "start": float(ch["start"]),
                "end": float(ch["end"]),
                "duration": round(float(ch["end"]) - float(ch["start"]), 2),
                "notable_moments": ch.get("notable_moments", []),
                "key": chapter_key,
                "url": url,
            })

        result = {"chapters": output_chapters}
        update_job_sync(job_id, status="done", result=result)
        log.info("chapter_extract_done", job_id=job_id, count=len(output_chapters))
        return result

    except Exception as exc:
        update_job_sync(job_id, status="failed", error=str(exc))
        log.error("chapter_extract_failed", job_id=job_id, error=str(exc))
        raise
    finally:
        if work_dir and work_dir.exists():
            shutil.rmtree(work_dir, ignore_errors=True)
        if local_path and local_path.exists():
            try:
                local_path.unlink()
            except OSError:
                pass
