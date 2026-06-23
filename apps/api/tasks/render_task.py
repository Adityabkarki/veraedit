"""
ViraEdit — Render Celery Task (EP-1.5 / T-1.5.1).

Encodes a timeline into a video file via FFmpeg.

This is a stub implementation for EP-1.5 — it creates the render row,
marks it as processing, and simulates progress updates.
Real FFmpeg encoding is implemented in EP-7.1 (FFmpeg Render Engine).

Queue: "render"
Retries: 1 max (render failures need human review)
Windows: uses --pool=solo

The task:
1. Loads the active timeline for the project
2. Resolves all asset paths from MinIO
3. Builds an FFmpeg command for the target platform
4. Runs FFmpeg with progress monitoring
5. Uploads the output to MinIO (viraedit-renders bucket)
6. Updates Render.status → READY and Render.storage_key
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from celery_app import celery_app

log = logging.getLogger("viraedit.tasks.render")

# Platform encoding presets
PLATFORM_PRESETS = {
    "youtube":          {"width": 1920, "height": 1080, "crf": 18, "audio_bitrate": "192k"},
    "youtube_shorts":   {"width": 1080, "height": 1920, "crf": 18, "audio_bitrate": "192k"},
    "instagram":        {"width": 1080, "height": 1080, "crf": 20, "audio_bitrate": "128k"},
    "instagram_reels":  {"width": 1080, "height": 1920, "crf": 20, "audio_bitrate": "128k"},
    "tiktok":           {"width": 1080, "height": 1920, "crf": 22, "audio_bitrate": "128k"},
    "facebook":         {"width": 1280, "height": 720,  "crf": 20, "audio_bitrate": "128k"},
    "custom":           {"width": 1920, "height": 1080, "crf": 18, "audio_bitrate": "192k"},
}


@celery_app.task(
    name="render_video",
    queue="render",
    max_retries=1,
    default_retry_delay=60,
    acks_late=True,
    bind=True,
)
def render_video(
    self,
    render_id: str,
    project_id: str,
    platform: str = "youtube",
) -> dict:
    """
    Encode a project timeline to video for the specified platform.

    Args:
        render_id:  UUID of the Render row to process.
        project_id: UUID of the project being rendered.
        platform:   Target platform (determines resolution/codec settings).

    Returns:
        dict with {"status": "ready", "storage_key": "...", "duration_s": ...}
        or {"status": "error", "error": "..."}
    """
    log.info(
        "render_task_start: render_id=%s project_id=%s platform=%s",
        render_id, project_id, platform,
    )

    try:
        # Update render status → PROCESSING
        _update_render_status(render_id, "processing", progress=5.0)

        # Load stored job settings (short-clip trim, etc.)
        job = _load_render_job(render_id)
        stored_settings = (job or {}).get("render_settings") or {}

        # Load timeline and resolve asset paths
        timeline_data = _load_timeline(project_id)
        if not timeline_data:
            raise RuntimeError("No active timeline found for this project.")

        # Get platform encoding preset
        preset = PLATFORM_PRESETS.get(platform, PLATFORM_PRESETS["youtube"])

        # Build render settings record (merge stored short-clip params)
        render_settings = {
            "platform": platform,
            "width": preset["width"],
            "height": preset["height"],
            "crf": preset["crf"],
            "audio_bitrate": preset["audio_bitrate"],
            "codec": "libx264",
            "audio_codec": "aac",
            "format": "mp4",
            **stored_settings,
        }

        _update_render_status(render_id, "processing", progress=15.0)

        if stored_settings.get("is_short"):
            storage_key, out_duration = _render_short_clip(
                render_id,
                str(stored_settings.get("asset_id", "")),
                float(stored_settings.get("start_time", 0.0)),
                float(stored_settings.get("end_time", 0.0)),
                render_settings,
            )
        else:
            storage_key, out_duration = _real_render(
                render_id, project_id, platform, render_settings, timeline_data
            )

        # Mark render as READY
        _update_render_complete(
            render_id,
            storage_key=storage_key,
            duration_seconds=out_duration,
            render_settings=render_settings,
        )

        log.info(
            "render_task_complete: render_id=%s storage_key=%s",
            render_id, storage_key,
        )
        return {
            "status": "ready",
            "render_id": render_id,
            "storage_key": storage_key,
        }

    except Exception as exc:
        log.error(
            "render_task_failed: render_id=%s error=%s",
            render_id, exc, exc_info=True,
        )
        _update_render_error(render_id, str(exc))
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            return {"status": "error", "render_id": render_id, "error": str(exc)}


# ── DB helpers (sync, called from Celery worker) ──────────────────────────────

def _get_sync_conn():
    """Create a synchronous SQLAlchemy connection for Celery context."""
    from sqlalchemy import create_engine
    from config import settings
    sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
    engine = create_engine(sync_url)
    return engine


def _update_render_status(
    render_id: str,
    status: str,
    progress: float = 0.0,
    error: str = "",
) -> None:
    """Update render status in database."""
    from sqlalchemy import text
    engine = _get_sync_conn()
    project_id: str | None = None
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT project_id FROM renders WHERE id = :id"),
            {"id": render_id},
        ).fetchone()
        if row:
            project_id = str(row.project_id)
        conn.execute(
            text(
                "UPDATE renders SET status = :status, progress_percent = :progress, "
                "error_message = NULLIF(:error, ''), updated_at = NOW() "
                "WHERE id = :id"
            ),
            # render_status_enum stores UPPERCASE labels (QUEUED/PROCESSING/READY/ERROR)
            {"status": status.upper(), "progress": progress, "error": error, "id": render_id},
        )
    engine.dispose()

    if project_id:
        try:
            from ws.publisher import emit_render_progress
            emit_render_progress(
                project_id,
                render_id,
                status=status,
                progress_percent=progress,
            )
        except Exception:
            pass


def _update_render_complete(
    render_id: str,
    storage_key: str,
    duration_seconds: float,
    render_settings: dict,
) -> None:
    """Mark render as complete with output metadata."""
    import json
    from sqlalchemy import text
    engine = _get_sync_conn()
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE renders SET status = 'READY', progress_percent = 100.0, "
                "storage_key = :key, duration_seconds = :dur, "
                "render_settings = CAST(:settings AS jsonb), updated_at = NOW() "
                "WHERE id = :id"
            ),
            {
                "key": storage_key,
                "dur": duration_seconds,
                "settings": json.dumps(render_settings),
                "id": render_id,
            },
        )
    engine.dispose()


def _update_render_error(render_id: str, error_message: str) -> None:
    """Mark render as failed with an error message."""
    from sqlalchemy import text
    engine = _get_sync_conn()
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE renders SET status = 'ERROR', error_message = :err, "
                "updated_at = NOW() WHERE id = :id"
            ),
            {"err": error_message[:1999], "id": render_id},
        )
    engine.dispose()


def _load_render_job(render_id: str) -> dict | None:
    """Load render row metadata including render_settings JSON."""
    import json
    from sqlalchemy import text
    engine = _get_sync_conn()
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT platform, render_settings FROM renders WHERE id = :id"
                ),
                {"id": render_id},
            ).fetchone()
    finally:
        engine.dispose()
    if not row:
        return None
    settings = row[1]
    if isinstance(settings, str):
        settings = json.loads(settings)
    return {"platform": row[0], "render_settings": settings or {}}


def _load_timeline(project_id: str) -> dict | None:
    """Load the active timeline data for a project."""
    from sqlalchemy import text
    engine = _get_sync_conn()
    with engine.connect() as conn:
        result = conn.execute(
            text(
                "SELECT data FROM timelines "
                "WHERE project_id = :pid AND is_active = TRUE "
                "ORDER BY version DESC LIMIT 1"
            ),
            {"pid": project_id},
        )
        row = result.fetchone()
    engine.dispose()
    return row[0] if row else None


# ── Real FFmpeg render ────────────────────────────────────────────────────────

def _s3_client():
    """boto3 S3 client for MinIO (sync — safe in Celery)."""
    import boto3
    from botocore.config import Config
    from config import settings
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        region_name="us-east-1",
    )


def _asset_storage_key(asset_id: str) -> str | None:
    """Look up an asset's MinIO storage key."""
    from sqlalchemy import text
    engine = _get_sync_conn()
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT storage_key FROM assets WHERE id = :id"),
                {"id": asset_id},
            ).fetchone()
    finally:
        engine.dispose()
    return row[0] if row else None


def _download_asset(asset_id: str, dest_dir) -> "Path":  # type: ignore[name-defined]
    """Download an asset's source file from the media bucket to dest_dir."""
    from pathlib import Path
    key = _asset_storage_key(asset_id)
    if not key:
        raise RuntimeError(f"Asset {asset_id} has no storage key.")
    dest = Path(dest_dir) / Path(key).name
    _s3_client().download_file(Bucket="viraedit-media", Key=key, Filename=str(dest))
    return dest


def _ffprobe_duration(path) -> float:
    """Return media duration in seconds via ffprobe, or 0.0."""
    import subprocess
    from config import settings
    try:
        out = subprocess.run(
            [settings.FFPROBE_PATH, "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            check=True, capture_output=True, text=True,
        )
        return float(out.stdout.strip() or 0.0)
    except Exception:
        return 0.0


def _real_render(
    render_id: str,
    project_id: str,
    platform: str,
    render_settings: dict,
    timeline_data: dict,
) -> tuple[str, float]:
    """
    Render the timeline's video clips to a single MP4 with FFmpeg and upload it
    to the renders bucket. Returns (storage_key, output_duration_seconds).

    Each video clip is trimmed to its source range and scaled+padded to the
    target resolution (letterbox), then clips are concatenated in timeline order.
    """
    import shutil
    import subprocess
    import tempfile
    from pathlib import Path
    from config import settings

    width  = int(render_settings["width"])
    height = int(render_settings["height"])
    crf    = int(render_settings["crf"])
    abr    = str(render_settings["audio_bitrate"])

    # Collect video clips, ordered by timeline position
    clips: list[dict] = []
    for track in timeline_data.get("tracks", []):
        if (track.get("type") or "").lower() == "video":
            clips.extend(track.get("clips", []))
    clips.sort(key=lambda c: float(c.get("timeline_start", 0.0)))

    if not clips:
        raise RuntimeError("Timeline has no video clips to render.")

    vf = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1"
    )

    with tempfile.TemporaryDirectory(prefix="viraedit_render_") as tmp_dir:
        tmp = Path(tmp_dir)

        # Download each unique source asset once
        asset_files: dict[str, Path] = {}
        for c in clips:
            aid = c["asset_id"]
            if aid not in asset_files:
                asset_files[aid] = _download_asset(aid, tmp)

        # Trim + scale each clip into a normalised segment
        segments: list[Path] = []
        for i, c in enumerate(clips):
            src = asset_files[c["asset_id"]]
            ss = float(c.get("source_start", 0.0))
            to = float(c.get("source_end", 0.0))
            seg = tmp / f"seg{i}.mp4"
            cmd = [
                settings.FFMPEG_PATH, "-y",
                "-ss", str(ss), "-to", str(to), "-i", str(src),
                "-vf", vf, "-r", "30",
                "-c:v", "libx264", "-crf", str(crf), "-preset", "veryfast", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", abr, "-ar", "48000", "-ac", "2",
                str(seg),
            ]
            subprocess.run(cmd, check=True, capture_output=True)
            segments.append(seg)
            _update_render_status(
                render_id, "processing",
                progress=15.0 + (i + 1) / len(clips) * 65.0,
            )

        # Concatenate segments (all share codec/params → stream copy via concat demuxer)
        output = tmp / "output.mp4"
        if len(segments) == 1:
            shutil.copy(segments[0], output)
        else:
            listfile = tmp / "concat.txt"
            listfile.write_text(
                "\n".join(f"file '{p.as_posix()}'" for p in segments), encoding="utf-8"
            )
            subprocess.run(
                [settings.FFMPEG_PATH, "-y", "-f", "concat", "-safe", "0",
                 "-i", str(listfile), "-c", "copy", "-movflags", "+faststart", str(output)],
                check=True, capture_output=True,
            )

        _update_render_status(render_id, "processing", progress=88.0)

        duration = _ffprobe_duration(output)

        # Upload to the renders bucket
        storage_key = f"renders/{project_id}/{platform}/{render_id[:8]}/output.mp4"
        _s3_client().upload_file(
            Filename=str(output),
            Bucket="viraedit-renders",
            Key=storage_key,
            ExtraArgs={"ContentType": "video/mp4"},
        )

        log.info(
            "render_ffmpeg_complete: key=%s clips=%d duration=%.1fs",
            storage_key, len(clips), duration,
        )
        return storage_key, duration


def _render_short_clip(
    render_id: str,
    asset_id: str,
    start_time: float,
    end_time: float,
    render_settings: dict,
) -> tuple[str, float]:
    """
    Export a trimmed short from one source asset.
    Supports multi-segment topic compilations via render_settings.segments[].
    """
    import subprocess
    import tempfile
    from pathlib import Path
    from config import settings

    segments = render_settings.get("segments") or []
    if segments and isinstance(segments, list) and len(segments) > 1:
        return _render_short_clip_multi(render_id, asset_id, segments, render_settings)

    if not asset_id:
        raise RuntimeError("Short render is missing asset_id.")
    if end_time <= start_time:
        raise RuntimeError("Short render end_time must be after start_time.")

    width = int(render_settings["width"])
    height = int(render_settings["height"])
    crf = int(render_settings["crf"])
    abr = str(render_settings["audio_bitrate"])
    pan_x = float(render_settings.get("pan_x", 0.5))
    short_styling = render_settings.get("short_styling") or {}

    from tasks.shorts_engine import build_short_video_filter, short_speed_multiplier
    speed = short_speed_multiplier(short_styling)
    vf = build_short_video_filter(pan_x, width, height, short_styling)
    if abs(speed - 1.0) > 0.01:
        vf = f"{vf},setpts=PTS/{speed}"

    with tempfile.TemporaryDirectory(prefix="viraedit_short_") as tmp_dir:
        tmp = Path(tmp_dir)
        src = _download_asset(asset_id, tmp)
        output = tmp / "short.mp4"
        audio_filters: list[str] = []
        if abs(speed - 1.0) > 0.01:
            remaining = speed
            while remaining < 0.5:
                audio_filters.append("atempo=0.5")
                remaining /= 0.5
            while remaining > 2.0:
                audio_filters.append("atempo=2.0")
                remaining /= 2.0
            if abs(remaining - 1.0) > 0.01:
                audio_filters.append(f"atempo={remaining:.4f}")

        cmd = [
            settings.FFMPEG_PATH, "-y",
            "-ss", str(start_time), "-to", str(end_time), "-i", str(src),
            "-vf", vf, "-r", "30",
            "-c:v", "libx264", "-crf", str(crf), "-preset", "veryfast", "-pix_fmt", "yuv420p",
        ]
        if audio_filters:
            cmd.extend(["-af", ",".join(audio_filters)])
        cmd.extend([
            "-c:a", "aac", "-b:a", abr, "-ar", "48000", "-ac", "2",
            "-movflags", "+faststart",
            str(output),
        ])
        subprocess.run(cmd, check=True, capture_output=True)
        _update_render_status(render_id, "processing", progress=88.0)

        duration = _ffprobe_duration(output)
        storage_key = f"renders/shorts/{asset_id}/{render_id[:8]}/output.mp4"
        _s3_client().upload_file(
            Filename=str(output),
            Bucket="viraedit-renders",
            Key=storage_key,
            ExtraArgs={"ContentType": "video/mp4"},
        )
        log.info(
            "short_clip_render_complete: asset=%s %.2f-%.2f dur=%.1fs key=%s",
            asset_id, start_time, end_time, duration, storage_key,
        )
        return storage_key, duration


def _render_short_clip_multi(
    render_id: str,
    asset_id: str,
    segments: list,
    render_settings: dict,
) -> tuple[str, float]:
    """Concat multiple trimmed segments into one vertical short."""
    import subprocess
    import tempfile
    from pathlib import Path
    from config import settings

    width = int(render_settings["width"])
    height = int(render_settings["height"])
    crf = int(render_settings["crf"])
    abr = str(render_settings["audio_bitrate"])
    pan_x = float(render_settings.get("pan_x", 0.5))
    short_styling = render_settings.get("short_styling") or {}

    from tasks.shorts_engine import build_short_video_filter, short_speed_multiplier
    speed = short_speed_multiplier(short_styling)
    vf = build_short_video_filter(pan_x, width, height, short_styling)
    if abs(speed - 1.0) > 0.01:
        vf = f"{vf},setpts=PTS/{speed}"

    with tempfile.TemporaryDirectory(prefix="viraedit_short_multi_") as tmp_dir:
        tmp = Path(tmp_dir)
        src = _download_asset(asset_id, tmp)
        part_files: list[Path] = []

        for i, seg in enumerate(segments):
            st = float(seg.get("start_time", seg.get("start", 0)))
            en = float(seg.get("end_time", seg.get("end", st + 1)))
            if en <= st:
                continue
            part = tmp / f"part_{i:02d}.mp4"
            cmd = [
                settings.FFMPEG_PATH, "-y",
                "-ss", str(st), "-to", str(en), "-i", str(src),
                "-vf", vf, "-r", "30",
                "-c:v", "libx264", "-crf", str(crf), "-preset", "veryfast", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", abr, "-ar", "48000", "-ac", "2",
                str(part),
            ]
            subprocess.run(cmd, check=True, capture_output=True)
            part_files.append(part)
            _update_render_status(render_id, "processing", progress=40.0 + i * 8)

        if not part_files:
            raise RuntimeError("No valid segments to render for topic short.")

        output = tmp / "short.mp4"
        if len(part_files) == 1:
            part_files[0].rename(output)
        else:
            concat_list = tmp / "concat.txt"
            concat_list.write_text(
                "\n".join(f"file '{p.as_posix()}'" for p in part_files),
                encoding="utf-8",
            )
            subprocess.run([
                settings.FFMPEG_PATH, "-y",
                "-f", "concat", "-safe", "0", "-i", str(concat_list),
                "-c", "copy", "-movflags", "+faststart",
                str(output),
            ], check=True, capture_output=True)

        duration = _ffprobe_duration(output)
        storage_key = f"renders/shorts/{asset_id}/{render_id[:8]}/output.mp4"
        _s3_client().upload_file(
            Filename=str(output),
            Bucket="viraedit-renders",
            Key=storage_key,
            ExtraArgs={"ContentType": "video/mp4"},
        )
        log.info(
            "short_clip_multi_render_complete: asset=%s parts=%d dur=%.1fs",
            asset_id, len(part_files), duration,
        )
        return storage_key, duration
