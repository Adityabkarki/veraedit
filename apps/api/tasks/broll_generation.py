"""
ViraEdit — B-roll generation Celery task.

Orchestrates:
  1. Generate image via DALL-E 3 (fallback → Gemini)
  2. Save to temp file
  3. Convert to video clip with Ken Burns animation
  4. Upload to MinIO
  5. Create Asset record in DB
  6. Insert clip into timeline overlay track
  7. Store asset_id in the suggestion record
  8. Emit progress via WebSocket at each stage
"""

from __future__ import annotations

import io
import json
import mimetypes
import re
import tempfile
import uuid
from pathlib import Path

import boto3
import structlog
from botocore.config import Config as BotoConfig
from celery import shared_task
from sqlalchemy import text

from config import settings
from sqlalchemy import create_engine

_sync_db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
_sync_engine = create_engine(_sync_db_url, pool_pre_ping=True)

log = structlog.get_logger("viraedit.tasks.broll_generation")

_BROLL_ASPECT = "16:9"
_BUCKET_MEDIA = "viraedit-media"


def _upload_to_minio(file_path: str, storage_key: str) -> None:
    """Upload a local file to MinIO using sync boto3 client."""
    client = boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        config=BotoConfig(signature_version="s3v4"),
    )
    content_type, _ = mimetypes.guess_type(file_path)
    client.upload_file(
        Filename=file_path,
        Bucket=_BUCKET_MEDIA,
        Key=storage_key,
        ExtraArgs={"ContentType": content_type or "video/mp4"},
    )


def _generate_download_url(storage_key: str, expires_in: int = 86400 * 7) -> str:
    """Generate a pre-signed download URL for a MinIO object (sync)."""
    client = boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        config=BotoConfig(signature_version="s3v4"),
    )
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": _BUCKET_MEDIA, "Key": storage_key},
        ExpiresIn=expires_in,
    )


def _update_suggestion_action(
    suggestion_id: str, project_id: str, asset_id: str, updates: dict,
) -> None:
    """Merge updates into the suggestion's action JSONB column."""
    with _sync_engine.begin() as conn:
        row = conn.execute(
            text("SELECT action FROM suggestions WHERE id = :id AND project_id = :pid"),
            {"id": suggestion_id, "pid": project_id},
        ).fetchone()
        if not row:
            log.warning("suggestion_not_found", suggestion_id=suggestion_id)
            return
        action = dict(row[0] or {})
        action.update(updates)
        conn.execute(
            text("""
                UPDATE suggestions
                SET action = CAST(:action AS jsonb), updated_at = NOW()
                WHERE id = :id AND project_id = :pid
            """),
            {"action": json.dumps(action, ensure_ascii=False), "id": suggestion_id, "pid": project_id},
        )


def _emit_progress(project_id: str, asset_id: str, percent: float, message: str) -> None:
    """Emit a WebSocket progress event for the B-roll generation pipeline."""
    try:
        from ws.publisher import emit_pipeline_progress
        emit_pipeline_progress(
            project_id=project_id,
            asset_id=asset_id,
            stage="broll_generation",
            asset_status="analyzing",
            progress_percent=percent,
            message=message,
        )
    except Exception as exc:
        log.warning("ws_emit_failed", error=str(exc))


def _download_stock_video(url: str, tmp_dir: Path) -> Path:
    """Download a stock video from URL to a temporary file."""
    import httpx
    resp = httpx.get(url, timeout=60, follow_redirects=True)
    resp.raise_for_status()
    fname = f"stock_{uuid.uuid4().hex[:12]}.mp4"
    path = tmp_dir / fname
    path.write_bytes(resp.content)
    return path


def _image_to_video(image_bytes: bytes, tmp_dir: Path, duration: float) -> Path:
    """Convert a generated image to a Ken Burns animated video clip."""
    from processors.imagegen import image_path_to_video

    img_path = tmp_dir / f"broll_img_{uuid.uuid4().hex[:8]}.png"
    img_path.write_bytes(image_bytes)

    out_path = tmp_dir / f"broll_video_{uuid.uuid4().hex[:8]}.mp4"
    result = image_path_to_video(
        image_path=img_path,
        output_path=out_path,
        duration=min(duration, 8.0),
        fps=30,
        aspect_ratio=_BROLL_ASPECT,
        animation="ken_burns",
    )
    return result


def _create_asset_record(
    project_id: str,
    storage_key: str,
    original_filename: str,
    duration: float,
    file_size: int,
    image_prompt: str,
    *,
    broll_source: str = "ai_broll_generation",
) -> str:
    """Create an Asset record in the DB for the generated/stock B-roll."""
    asset_id = str(uuid.uuid4())
    with _sync_engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO assets (
                    id, project_id, name, original_filename, storage_key,
                    file_size, duration_seconds, media_type, mime_type, status,
                    media_metadata, created_at, updated_at
                ) VALUES (
                    :id, :project_id, :name, :original_filename, :storage_key,
                    :file_size, :duration_seconds, :media_type, :mime_type, :status,
                    CAST(:media_metadata AS jsonb), NOW(), NOW()
                )
            """),
            {
                "id": asset_id,
                "project_id": project_id,
                "name": f"B-Roll: {image_prompt[:60]}",
                "original_filename": original_filename,
                "storage_key": storage_key,
                "file_size": file_size,
                "duration_seconds": duration,
                "media_type": "video",
                "mime_type": "video/mp4",
                "status": "ready",
                "media_metadata": json.dumps({
                    "role": "broll",
                    "source": broll_source,
                    "prompt": image_prompt,
                    "width": 1920,
                    "height": 1080,
                }),
            },
        )
    return asset_id


def _find_broll_track_id(tracks: list[dict], timeline_start: float, timeline_end: float) -> str:
    """Find a broll track lane with no overlap, or return a new lane id.

    Uses the same `track-broll-{n}` format the frontend serialization
    produces so `apiTimelineToStore` always maps it back to the correct
    frontend track (broll / broll-2 / broll-3 …).
    """
    broll_tracks = []
    for t in tracks:
        tid = (t.get("id") or "").lower()
        if t.get("type") == "overlay" and ("broll" in tid or tid.startswith("track-broll")):
            broll_tracks.append(t)

    if not broll_tracks:
        return "track-broll-1"

    duration = timeline_end - timeline_start
    for t in broll_tracks:
        has_overlap = False
        for c in (t.get("clips") or []):
            cs = float(c.get("timeline_start", 0))
            ce = float(c.get("timeline_end", cs))
            if cs < timeline_end - 0.001 and ce > timeline_start + 0.001:
                has_overlap = True
                break
        if not has_overlap:
            return t["id"]

    existing_indices = []
    for t in broll_tracks:
        match = re.search(r"broll(?:-(\d+))?(?:-\d+)?$", t["id"])
        if match:
            idx_str = match.group(1)
            idx = int(idx_str) if idx_str else 1
            existing_indices.append(idx)
    next_idx = max(existing_indices) + 1 if existing_indices else 2
    return f"track-broll-{next_idx}"


def _fetch_active_timeline_row(project_id: str) -> tuple[uuid.UUID, int, dict] | None:
    """Load id, version, and data for the active timeline (sync Celery-safe)."""
    with _sync_engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT id, version, data FROM timelines "
                "WHERE project_id = :pid AND is_active = TRUE "
                "ORDER BY version DESC LIMIT 1"
            ),
            {"pid": project_id},
        ).fetchone()
    if row is None:
        return None
    tl_id, version, raw_data = row[0], row[1], row[2]
    data = dict(raw_data) if raw_data else {}
    return tl_id, version, data


def _insert_timeline_clip(
    project_id: str,
    asset_id: str,
    prompt: str,
    broll_reason: str,
    timeline_start: float,
    timeline_end: float,
    download_url: str,
    source: str = "ai_generated",
) -> None:
    """Insert a B-roll clip into the project's timeline overlay track.

    Uses the `broll` track family so the frontend displays clips on
    dedicated B-Roll lanes. Multiple overlapping B-roll clips get
    auto-stacked onto broll-2, broll-3, etc.
    """
    row = _fetch_active_timeline_row(project_id)
    if row is None:
        log.warning("timeline_not_found", project_id=project_id)
        return
    current_id, current_version, data = row

    # 2. Find or create broll track lane
    tracks = data.setdefault("tracks", [])
    target_track_id = _find_broll_track_id(tracks, timeline_start, timeline_end)
    track = next((t for t in tracks if t.get("id") == target_track_id), None)

    if track is None:
        lane_num = 1
        m = re.search(r"broll-(\d+)$", target_track_id)
        if m:
            lane_num = int(m.group(1))
        track = {
            "id": target_track_id,
            "type": "overlay",
            "name": f"B-Roll{f' {lane_num}' if lane_num > 1 else ''}",
            "muted": False,
            "locked": False,
            "visible": True,
            "clips": [],
        }
        tracks.append(track)

    # 3. Build clip
    is_stock = source == "stock"
    duration = timeline_end - timeline_start
    clip_id = f"broll-{uuid.uuid4().hex[:8]}"
    clip = {
        "id": clip_id,
        "asset_id": asset_id,
        "source_start": 0.0,
        "source_end": duration,
        "timeline_start": timeline_start,
        "timeline_end": timeline_end,
        "speed": 1.0,
        "muted": not is_stock,
        "volume": 0.0 if not is_stock else 1.0,
        "effects": [
            {
                "type": "visual_overlay",
                "params": {
                    "visual_type": "broll_overlay",
                    "display_value": prompt[:60],
                    "suggested_visual": "ai_broll",
                    "overlay_mode": "fullscreen",
                    "broll_type": source,
                    "media_url": download_url,
                    "generation_prompt": prompt,
                    "broll_reason": broll_reason,
                },
            }
        ],
        "transitions": {},
        "label": f"{'Stock' if is_stock else 'AI'} B-roll: {prompt[:50]}",
    }
    track["clips"].append(clip)

    # 4. Save as new timeline version
    new_version = current_version + 1
    with _sync_engine.begin() as conn:
        conn.execute(
            text("UPDATE timelines SET is_active = FALSE WHERE id = :id"),
            {"id": current_id},
        )
        conn.execute(
            text("""
                INSERT INTO timelines (id, project_id, name, version, data, parent_id, is_active, created_at, updated_at)
                VALUES (:id, :project_id, :name, :version, CAST(:data AS jsonb), :parent_id, :is_active, NOW(), NOW())
            """),
            {
                "id": str(uuid.uuid4()),
                "project_id": project_id,
                "name": f"Added AI B-roll: {prompt[:60]}",
                "version": new_version,
                "data": json.dumps(data, ensure_ascii=False),
                "parent_id": current_id,
                "is_active": True,
            },
        )

    log.info("timeline_clip_inserted", project_id=project_id, clip_id=clip_id)


# ── Celery task ────────────────────────────────────────────────────────────────

@shared_task(
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
    queue="render",
)
def generate_and_insert_broll(
    self,
    project_id: str,
    asset_id: str,
    suggestion_id: str,
    prompt: str,
    broll_reason: str,
    timeline_start: float,
    timeline_end: float,
) -> dict:
    """
    Generate a B-roll image, convert to video, upload, and insert into timeline.

    Called asynchronously from POST /broll/generate.
    """
    import tempfile
    from pathlib import Path

    log.info("broll_generation_started",
             project_id=project_id, suggestion_id=suggestion_id,
             prompt=prompt[:80])

    tmp_dir_obj = tempfile.TemporaryDirectory(prefix="broll_gen_")
    tmp_dir = Path(tmp_dir_obj.name)

    try:
        # ── 1. Generate image ──────────────────────────────────────────────
        _update_suggestion_action(suggestion_id, project_id, asset_id, {
            "generation_status": "generating_image",
        })
        _emit_progress(project_id, asset_id, 10, "Generating B-roll image...")

        from processors.dalle_generator import generate_broll_image
        image_bytes, provider = generate_broll_image(prompt, aspect="16:9", quality="standard")
        if image_bytes is None:
            _update_suggestion_action(suggestion_id, project_id, asset_id, {
                "generation_status": "error",
                "error_message": "Image generation failed — no API key or service unavailable.",
            })
            _emit_progress(project_id, asset_id, 100, "B-roll generation failed — no image service available.")
            return {"status": "error", "message": "Image generation failed"}

        log.info("broll_image_generated", provider=provider, size=len(image_bytes))

        # ── 2. Convert to video (Ken Burns) ────────────────────────────────
        _update_suggestion_action(suggestion_id, project_id, asset_id, {
            "generation_status": "rendering_video",
        })
        _emit_progress(project_id, asset_id, 40, "Creating B-roll video clip...")

        duration = max(3.0, min(8.0, timeline_end - timeline_start))
        video_path = _image_to_video(image_bytes, tmp_dir, duration)

        log.info("broll_video_rendered", path=str(video_path), size=video_path.stat().st_size)

        # ── 3. Upload to MinIO ─────────────────────────────────────────────
        _update_suggestion_action(suggestion_id, project_id, asset_id, {
            "generation_status": "uploading",
        })
        _emit_progress(project_id, asset_id, 65, "Uploading B-roll asset...")

        fname = f"broll_{uuid.uuid4().hex[:12]}.mp4"
        storage_key = f"projects/{project_id}/assets/{fname}"
        _upload_to_minio(str(video_path), storage_key)

        download_url = _generate_download_url(storage_key, expires_in=86400 * 7)

        log.info("broll_uploaded", storage_key=storage_key)

        # ── 4. Create Asset record ─────────────────────────────────────────
        _emit_progress(project_id, asset_id, 80, "Saving asset record...")

        new_asset_id = _create_asset_record(
            project_id=project_id,
            storage_key=storage_key,
            original_filename=fname,
            duration=duration,
            file_size=video_path.stat().st_size,
            image_prompt=prompt,
        )

        # ── 5. Insert into timeline ────────────────────────────────────────
        _emit_progress(project_id, asset_id, 90, "Placing B-roll on timeline...")

        _insert_timeline_clip(
            project_id=project_id,
            asset_id=new_asset_id,
            prompt=prompt,
            broll_reason=broll_reason,
            timeline_start=timeline_start,
            timeline_end=timeline_start + duration,
            download_url=download_url,
            source="ai_generated",
        )

        # ── 6. Mark suggestion as generated ────────────────────────────────
        _update_suggestion_action(suggestion_id, project_id, asset_id, {
            "generation_status": "generated",
            "generated_asset_id": new_asset_id,
            "generated_asset_url": download_url,
            "generation_provider": provider,
        })
        _emit_progress(project_id, asset_id, 100, "B-roll ready!")

        log.info("broll_generation_complete",
                 suggestion_id=suggestion_id, asset_id=new_asset_id)

        # Cleanup
        tmp_dir_obj.cleanup()

        return {
            "status": "success",
            "asset_id": new_asset_id,
            "asset_url": download_url,
            "provider": provider,
        }

    except Exception as exc:
        log.error("broll_generation_failed", error=str(exc), exc_info=True)
        _update_suggestion_action(suggestion_id, project_id, asset_id, {
            "generation_status": "error",
            "error_message": str(exc)[:200],
        })
        _emit_progress(project_id, asset_id, 100, f"B-roll generation failed: {str(exc)[:100]}")
        tmp_dir_obj.cleanup()
        raise


@shared_task(
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
    queue="render",
)
def insert_stock_broll(
    self,
    project_id: str,
    asset_id: str,
    suggestion_id: str | None = None,
    stock_url: str = "",
    prompt: str = "",
    broll_reason: str = "explanation",
    timeline_start: float = 0.0,
    timeline_end: float = 4.0,
) -> dict:
    """
    Download a stock video, upload to MinIO, create asset, insert into timeline.
    When suggestion_id is None, no suggestion record is updated (direct insert).
    """
    import tempfile
    from pathlib import Path

    log.info("stock_broll_insertion_started",
             project_id=project_id, suggestion_id=suggestion_id, url=stock_url[:80])

    tmp_dir_obj = tempfile.TemporaryDirectory(prefix="broll_stock_")
    tmp_dir = Path(tmp_dir_obj.name)

    try:
        if suggestion_id:
            _update_suggestion_action(suggestion_id, project_id, asset_id, {
                "generation_status": "downloading",
            })
        _emit_progress(project_id, asset_id, 20, "Downloading stock video...")

        video_path = _download_stock_video(stock_url, tmp_dir)
        duration = max(3.0, min(8.0, timeline_end - timeline_start))

        _emit_progress(project_id, asset_id, 50, "Uploading stock video...")
        if suggestion_id:
            _update_suggestion_action(suggestion_id, project_id, asset_id, {
                "generation_status": "uploading",
            })

        fname = f"broll_stock_{uuid.uuid4().hex[:12]}.mp4"
        storage_key = f"projects/{project_id}/assets/{fname}"
        _upload_to_minio(str(video_path), storage_key)
        download_url = _generate_download_url(storage_key, expires_in=86400 * 7)

        _emit_progress(project_id, asset_id, 70, "Saving asset record...")
        new_asset_id = _create_asset_record(
            project_id=project_id,
            storage_key=storage_key,
            original_filename=fname,
            duration=duration,
            file_size=video_path.stat().st_size,
            image_prompt=prompt,
            broll_source="stock_pexels",
        )
        _insert_timeline_clip(
            project_id=project_id,
            asset_id=new_asset_id,
            prompt=prompt,
            broll_reason=broll_reason,
            timeline_start=timeline_start,
            timeline_end=timeline_start + duration,
            download_url=download_url,
            source="stock",
        )

        if suggestion_id:
            _update_suggestion_action(suggestion_id, project_id, asset_id, {
                "generation_status": "generated",
                "generated_asset_id": new_asset_id,
                "generated_asset_url": download_url,
                "generation_provider": "stock_pexels",
            })
        _emit_progress(project_id, asset_id, 100, "B-roll ready!")

        tmp_dir_obj.cleanup()
        return {"status": "success", "asset_id": new_asset_id, "asset_url": download_url}

    except Exception as exc:
        log.error("stock_broll_failed", error=str(exc), exc_info=True)
        if suggestion_id:
            _update_suggestion_action(suggestion_id, project_id, asset_id, {
                "generation_status": "error",
                "error_message": str(exc)[:200],
            })
        _emit_progress(project_id, asset_id, 100, f"Stock B-roll failed: {str(exc)[:100]}")
        tmp_dir_obj.cleanup()
        raise
