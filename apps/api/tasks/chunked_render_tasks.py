"""
Chunked long-form Director render tasks (Phase 14).

Celery group renders each segment; chord callback stitches losslessly.
Failed segments can be retried independently (Render Resumability Law).
"""
from __future__ import annotations

import asyncio
import logging
import tempfile
import uuid
from pathlib import Path
from typing import Any

from celery import chord, group
from sqlalchemy import text

from celery_app import celery_app

log = logging.getLogger("viraedit.tasks.chunked_render")


def _sync_engine():
    from sqlalchemy import create_engine
    from config import settings

    return create_engine(settings.DATABASE_URL.replace("+asyncpg", ""))


def _create_segment_rows(render_id: str, segments: list) -> list[str]:
    """Insert render_segments rows; return list of segment UUID strings."""
    engine = _sync_engine()
    ids: list[str] = []
    with engine.begin() as conn:
        for seg in segments:
            seg_id = str(uuid.uuid4())
            conn.execute(
                text(
                    """
                    INSERT INTO render_segments
                    (id, render_id, segment_index, start_frame, end_frame, status, created_at, updated_at)
                    VALUES (:id, :render_id, :idx, :start, :end, 'pending', NOW(), NOW())
                    """
                ),
                {
                    "id": seg_id,
                    "render_id": render_id,
                    "idx": seg.segment_index,
                    "start": seg.start_frame,
                    "end": seg.end_frame,
                },
            )
            ids.append(seg_id)
    engine.dispose()
    return ids


def _update_segment_status(
    segment_id: str,
    status: str,
    *,
    storage_key: str | None = None,
    error: str | None = None,
) -> None:
    engine = _sync_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE render_segments
                SET status = :status,
                    output_storage_key = COALESCE(:key, output_storage_key),
                    error_message = :error,
                    updated_at = NOW()
                WHERE id = :id
                """
            ),
            {
                "id": segment_id,
                "status": status.lower(),
                "key": storage_key,
                "error": error,
            },
        )
    engine.dispose()


def _emit_segment_progress(render_id: str, project_id: str, completed: int, total: int) -> None:
    from tasks.render_task import _update_render_status

    progress = 15.0 + (70.0 * completed / max(total, 1))
    _update_render_status(render_id, "processing", progress=progress)
    try:
        from ws.publisher import emit_render_progress

        emit_render_progress(
            project_id,
            render_id,
            status="processing",
            progress_percent=progress,
            message=f"Rendered segment {completed}/{total}",
        )
    except Exception:
        pass


@celery_app.task(name="tasks.chunked_render.render_segment", queue="render", bind=True, max_retries=1)
def render_segment_task(
    self,
    segment_id: str,
    render_id: str,
    project_id: str,
    render_settings: dict[str, Any],
) -> dict[str, Any]:
    """Render one frame range of a Director timeline."""
    from processors.remotion_client import render_director_export, remotion_service_healthy
    from processors.storage_helpers import S3Storage
    from tasks.render_task import _load_compiled_director_timeline_sync

    engine = _sync_engine()
    try:
        with engine.begin() as conn:
            row = conn.execute(
                text(
                    "SELECT segment_index, start_frame, end_frame, status, output_storage_key "
                    "FROM render_segments WHERE id = :id"
                ),
                {"id": segment_id},
            ).fetchone()
    finally:
        engine.dispose()

    if not row:
        raise RuntimeError(f"Render segment {segment_id} not found.")

    if row.status and str(row.status).lower() == "complete" and row.output_storage_key:
        return {
            "segmentId": segment_id,
            "segmentIndex": row.segment_index,
            "storageKey": row.output_storage_key,
            "reused": True,
        }

    _update_segment_status(segment_id, "rendering")

    director_timeline, _ = _load_compiled_director_timeline_sync(project_id)
    if not director_timeline:
        _update_segment_status(segment_id, "failed", error="No compiled Director timeline.")
        raise RuntimeError("No compiled Director timeline for chunked render.")

    storage = S3Storage()
    asset_urls = render_settings.get("asset_urls") or {}
    primary = render_settings.get("primary_video_src")

    with tempfile.TemporaryDirectory(prefix="viraedit_seg_") as tmp:
        out = Path(tmp) / f"segment_{row.segment_index}.mp4"
        try:
            if not asyncio.run(remotion_service_healthy()):
                raise RuntimeError("Remotion service is not reachable.")

            asyncio.run(
                render_director_export(
                    director_timeline,
                    output_path=out.as_posix(),
                    asset_urls=asset_urls,
                    primary_video_src=primary,
                    dialogue_src=primary,
                    camera_feeds=render_settings.get("camera_feeds") or [],
                    frame_range=(int(row.start_frame), int(row.end_frame)),
                )
            )
        except Exception as exc:
            _update_segment_status(segment_id, "failed", error=str(exc))
            raise

        seg_key = (
            f"renders/{project_id}/segments/{render_id[:8]}/"
            f"seg_{row.segment_index}.mp4"
        )
        storage.client.upload_file(
            Filename=str(out),
            Bucket=storage.bucket,
            Key=seg_key,
            ExtraArgs={"ContentType": "video/mp4"},
        )
        _update_segment_status(segment_id, "complete", storage_key=seg_key)
        log.info(
            "render_segment_complete render_id=%s segment=%s key=%s",
            render_id,
            row.segment_index,
            seg_key,
        )
        return {
            "segmentId": segment_id,
            "segmentIndex": row.segment_index,
            "storageKey": seg_key,
            "reused": False,
        }


@celery_app.task(name="tasks.chunked_render.stitch", queue="render")
def stitch_render_segments_task(
    segment_results: list[dict[str, Any]],
    render_id: str,
    project_id: str,
    render_settings: dict[str, Any],
) -> dict[str, Any]:
    """Download segment outputs, stitch, verify audio, upload final render."""
    from processors.storage_helpers import S3Storage
    from services.render.stitch_segments import (
        stitch_segment_files,
        verify_audio_continuity_at_joins,
    )
    from tasks.render_task import _ffprobe_duration, _update_render_complete, _update_render_status

    engine = _sync_engine()
    with engine.begin() as conn:
        rows = conn.execute(
            text(
                """
                SELECT segment_index, output_storage_key, status
                FROM render_segments WHERE render_id = :rid ORDER BY segment_index
                """
            ),
            {"rid": render_id},
        ).fetchall()
    engine.dispose()

    complete_rows = [r for r in rows if r.output_storage_key]
    if len(complete_rows) != len(rows):
        raise RuntimeError("Cannot stitch — not all segments completed.")

    storage = S3Storage()
    _update_render_status(render_id, "processing", progress=88.0)

    with tempfile.TemporaryDirectory(prefix="viraedit_stitch_") as tmp:
        tmp_path = Path(tmp)
        local_paths: list[Path] = []
        for r in complete_rows:
            local = tmp_path / f"seg_{r.segment_index}.mp4"
            storage.client.download_file(storage.bucket, r.output_storage_key, str(local))
            local_paths.append(local)

        out = tmp_path / "stitched.mp4"
        stitch_segment_files(local_paths, out)
        audio_check = verify_audio_continuity_at_joins(
            out,
            local_paths,
            fps=float(render_settings.get("fps") or 30),
        )
        if not audio_check.get("ok"):
            log.warning("audio_join_check_warnings render_id=%s checks=%s", render_id, audio_check)

        duration = _ffprobe_duration(out)
        storage_key = (
            f"renders/{project_id}/{render_settings.get('platform', 'youtube')}"
            f"/{render_id[:8]}/output.mp4"
        )
        storage.client.upload_file(
            Filename=str(out),
            Bucket=storage.bucket,
            Key=storage_key,
            ExtraArgs={"ContentType": "video/mp4"},
        )

    render_settings["render_path"] = "chunked_director_export"
    render_settings["segmentCount"] = len(complete_rows)
    render_settings["audioJoinCheck"] = audio_check
    _update_render_complete(
        render_id,
        storage_key=storage_key,
        duration_seconds=duration,
        render_settings=render_settings,
    )
    return {"storageKey": storage_key, "durationSeconds": duration}


def dispatch_chunked_director_render(
    render_id: str,
    project_id: str,
    director_timeline: dict[str, Any],
    render_settings: dict[str, Any],
) -> tuple[str, float]:
    """
    Plan segments, dispatch Celery group+chord, block until stitched output ready.
    """
    from services.render.plan_render_segments import plan_render_segments

    segments = plan_render_segments(director_timeline)
    if len(segments) <= 1:
        raise RuntimeError("dispatch_chunked_director_render called for single-segment timeline")

    segment_ids = _create_segment_rows(render_id, segments)
    render_settings["chunked"] = True
    render_settings["segmentCount"] = len(segments)

    header = group(
        render_segment_task.s(sid, render_id, project_id, render_settings)
        for sid in segment_ids
    )
    callback = stitch_render_segments_task.s(render_id, project_id, render_settings)
    async_result = chord(header)(callback)
    result = async_result.get(timeout=3600 * 4)
    return result["storageKey"], float(result.get("durationSeconds") or 0)


def retry_failed_render_segments(
    render_id: str,
    project_id: str,
    render_settings: dict[str, Any],
) -> None:
    """Re-dispatch only failed segments, then stitch when all complete."""
    engine = _sync_engine()
    with engine.begin() as conn:
        failed = conn.execute(
            text(
                """
                SELECT id FROM render_segments
                WHERE render_id = :rid AND status = 'failed'
                ORDER BY segment_index
                """
            ),
            {"rid": render_id},
        ).fetchall()
        complete_count = conn.execute(
            text(
                "SELECT COUNT(*) FROM render_segments WHERE render_id = :rid AND status = 'complete'"
            ),
            {"rid": render_id},
        ).scalar()
        total = conn.execute(
            text("SELECT COUNT(*) FROM render_segments WHERE render_id = :rid"),
            {"rid": render_id},
        ).scalar()
    engine.dispose()

    if not failed:
        if complete_count == total:
            stitch_render_segments_task.apply(
                args=[[], render_id, project_id, render_settings],
            )
        return

    header = group(
        render_segment_task.s(str(r.id), render_id, project_id, render_settings)
        for r in failed
    )
    callback = stitch_render_segments_task.s(render_id, project_id, render_settings)
    chord(header)(callback)
