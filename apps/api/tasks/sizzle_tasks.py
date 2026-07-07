"""
ViraEdit — Sizzle reel generation Celery task (Phase 05).
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
from processors.music_library import pick_music_for_mood
from processors.sizzle_assembler import add_background_music, assemble_sizzle_reel
from processors.sizzle_finder import find_sizzle_moments_with_energy
from processors.storage_helpers import storage_sync
from processors.transcriber import transcribe_video
from services.job_sync import update_job_sync

log = structlog.get_logger("viraedit.tasks.sizzle")

PRESIGNED_EXPIRY_SECONDS = 86400


def _remap_words_for_montage(
    transcript: dict,
    fragments: list[dict],
) -> list[dict]:
    """Shift word timestamps to match concatenated montage timeline."""
    words = transcript.get("words") or []
    if not words or not fragments:
        return []

    remapped: list[dict] = []
    offset = 0.0
    for frag in fragments:
        frag_start = float(frag["start"])
        frag_end = float(frag["end"])
        frag_duration = frag_end - frag_start
        for word in words:
            w_start = float(word.get("start", 0))
            w_end = float(word.get("end", 0))
            if frag_start <= w_start <= frag_end:
                remapped.append({
                    **word,
                    "start": round(w_start - frag_start + offset, 3),
                    "end": round(w_end - frag_start + offset, 3),
                })
        offset += frag_duration
    return remapped


def _try_director_styled_sizzle(
    *,
    project_id: str,
    source_path: Path,
    work_dir: Path,
    remapped_words: list[dict],
    duration_seconds: float,
) -> Path | None:
    """Compile Social Director timeline for montage and render via render-director."""
    if not remapped_words or duration_seconds <= 0:
        return None

    try:
        from processors.reframer import reframe_video
        from processors.remotion_client import (
            PLATFORM_RENDER_VARIANTS,
            render_director_export,
            remotion_service_healthy,
        )
        from services.director.extract_signals import extract_director_signals
        from services.director.styled_shorts_pipeline import (
            ReframedClip,
            build_prepare_payload,
            load_styled_short_context_sync,
            prepare_styled_short_timeline_sync,
        )
        from services.director.transcript_segments import words_to_segments

        reframed_path = work_dir / "sizzle_reframed_9x16.mp4"
        _, warning = reframe_video(
            source_path,
            reframed_path,
            1080,
            1920,
            mode="face_track",
        )
        temp_key = f"temp/sizzle/{project_id}/{source_path.stem}_reframed.mp4"
        storage_sync.put_file(temp_key, reframed_path, "video/mp4")
        video_url = storage_sync.get_presigned_url(temp_key, expires=3600)
        reframed_id = f"sizzle-reframed-{source_path.stem}"
        reframed = ReframedClip(
            local_path=reframed_path,
            storage_key=temp_key,
            presigned_url=video_url,
            reframed_asset_id=reframed_id,
            warning=warning,
        )

        ctx = load_styled_short_context_sync(project_id)
        segments = words_to_segments(remapped_words)
        ctx.signals = extract_director_signals(
            segments=segments,
            words=remapped_words,
            duration_seconds=duration_seconds,
        )

        payload = build_prepare_payload(
            ctx,
            start_time=0.0,
            end_time=duration_seconds,
            reframed=reframed,
            base_only=True,
        )
        director_timeline = prepare_styled_short_timeline_sync(payload)

        if not asyncio.run(remotion_service_healthy()):
            return None

        asset_urls = dict(ctx.asset_urls)
        asset_urls[reframed_id] = video_url

        out_path = work_dir / "sizzle_director.mp4"
        asyncio.run(
            render_director_export(
                director_timeline,
                output_path=out_path.as_posix(),
                asset_urls=asset_urls,
                primary_video_src=video_url,
                dialogue_src=video_url,
                platform_variant=PLATFORM_RENDER_VARIANTS["youtube"],
            )
        )
        if out_path.exists():
            log.info("sizzle_director_styled_ok", project_id=project_id)
            return out_path
    except Exception as exc:
        log.warning("sizzle_director_styled_failed", error=str(exc))
    return None


@celery_app.task(bind=True, name="tasks.sizzle.generate", time_limit=1200)
def generate_sizzle_task(
    self: Task,
    job_id: str,
    video_key: str,
    project_id: str,
    target_duration: float = 30.0,
    music_mood: str = "upbeat",
    add_captions: bool = True,
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

        progress("finding_highlights")
        fragment_count = max(6, int(target_duration / 3))
        fragments = asyncio.run(
            find_sizzle_moments_with_energy(
                local_path,
                transcript,
                target_duration,
                fragment_count,
                project_id=project_id,
                job_id=job_id,
                workspace_id=project_id,
            )
        )
        if not fragments:
            raise ValueError("No highlight fragments found in this video.")

        progress("assembling")
        work_dir = Path(tempfile.gettempdir()) / "viraedit" / job_id / "sizzle_work"
        work_dir.mkdir(parents=True, exist_ok=True)
        raw_sizzle_path = work_dir / "sizzle_raw.mp4"
        assemble_sizzle_reel(local_path, fragments, raw_sizzle_path)

        current = raw_sizzle_path
        remapped_words = _remap_words_for_montage(transcript, fragments)
        montage_duration = sum(
            float(f["end"]) - float(f["start"]) for f in fragments
        )

        director_output = _try_director_styled_sizzle(
            project_id=project_id,
            source_path=raw_sizzle_path,
            work_dir=work_dir,
            remapped_words=remapped_words,
            duration_seconds=montage_duration,
        )
        if director_output is not None:
            current = director_output
        elif add_captions:
            progress("captioning")
            captioned_path = work_dir / "sizzle_captioned.mp4"
            if remapped_words:
                try:
                    asyncio.run(
                        render_captions_v2(
                            current,
                            captioned_path,
                            remapped_words,
                            style="kinetic",
                        )
                    )
                    current = captioned_path
                except Exception as exc:
                    log.warning("sizzle_caption_failed", error=str(exc))

        progress("adding_music")
        music_path = pick_music_for_mood(music_mood)
        final_path = work_dir / "sizzle_final.mp4"
        if music_path.exists():
            add_background_music(current, music_path, final_path)
            current = final_path

        out_key = f"projects/{project_id}/sizzle/{job_id}.mp4"
        storage_sync.put_file(out_key, current, "video/mp4")
        url = storage_sync.get_presigned_url(out_key, expires=PRESIGNED_EXPIRY_SECONDS)

        result = {
            "key": out_key,
            "url": url,
            "fragment_count": len(fragments),
            "duration": target_duration,
        }
        update_job_sync(job_id, status="done", result=result)
        log.info("sizzle_generate_done", job_id=job_id, fragments=len(fragments))
        return result

    except Exception as exc:
        update_job_sync(job_id, status="failed", error=str(exc))
        log.error("sizzle_generate_failed", job_id=job_id, error=str(exc))
        raise
    finally:
        if work_dir and work_dir.exists():
            shutil.rmtree(work_dir, ignore_errors=True)
        if local_path and local_path.exists():
            try:
                local_path.unlink()
            except OSError:
                pass
