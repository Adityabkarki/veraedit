"""
ViraEdit — Render API router (EP-1.5 / T-1.5.1).

Queue render → poll status → get download link.

Endpoints:
  POST   /projects/{id}/renders                    queue a new render
  GET    /projects/{id}/renders                    list all renders
  GET    /projects/{id}/renders/{render_id}         render status + progress
  GET    /projects/{id}/renders/{render_id}/download signed download URL
  DELETE /projects/{id}/renders/{render_id}         cancel / delete render

Render flow:
  1. Client POSTs with platform (youtube, tiktok, instagram_reels, etc.)
  2. API creates Render row (status=QUEUED), queues Celery task
  3. Client polls GET /{render_id} every few seconds
  4. When status=READY, client calls /download for a signed MinIO URL
  5. Signed URL valid for 1 hour

Platform presets:
  youtube:         1920×1080, H.264 CRF 18, AAC 192kbps
  youtube_shorts:  1080×1920, H.264 CRF 18, AAC 192kbps
  instagram_reels: 1080×1920, H.264 CRF 20, AAC 128kbps
  tiktok:          1080×1920, H.264 CRF 22, AAC 128kbps
  facebook:        1280×720,  H.264 CRF 20, AAC 128kbps
  custom:          uses global_settings from timeline
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from dependencies import CurrentUser, DbDep
from exceptions import ProjectNotFoundError
from models import Project, Render, Timeline
from models.render import RenderPlatform, RenderStatus

router = APIRouter(prefix="/api/v1/projects", tags=["renders"])
log = structlog.get_logger("viraedit.renders")


# ── Request / Response schemas ────────────────────────────────────────────────

class RenderCreateRequest(BaseModel):
    """Body for POST /renders — create a new render job."""
    platform: RenderPlatform = RenderPlatform.YOUTUBE
    name: str = Field(default="", max_length=255, description="Human name for this render")
    timeline_id: Optional[str] = Field(
        None, description="Specific timeline version to render (defaults to active)"
    )
    resolution: Optional[str] = Field(
        None, pattern=r"^\d+x\d+$",
        description="Custom resolution override (e.g. '1920x1080') — only used with platform=custom"
    )


def _render_to_dict(render: Render) -> dict:
    return {
        "id": str(render.id),
        "name": render.name,
        "platform": render.platform.value,
        "status": render.status.value,
        "progress_percent": render.progress_percent,
        "resolution": render.resolution,
        "storage_key": render.storage_key,
        "file_size_bytes": render.file_size,
        "duration_seconds": render.duration_seconds,
        "error_message": render.error_message,
        "celery_task_id": render.celery_task_id,
        "created_at": render.created_at.isoformat(),
        "updated_at": render.updated_at.isoformat(),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_project_or_404(project_id: uuid.UUID, user_id: uuid.UUID, db) -> Project:
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == user_id,
        )
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise ProjectNotFoundError()
    return project


async def _get_render_or_404(
    project_id: uuid.UUID, render_id: uuid.UUID, db
) -> Render:
    result = await db.execute(
        select(Render).where(
            Render.id == render_id,
            Render.project_id == project_id,
        )
    )
    render = result.scalar_one_or_none()
    if render is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Render not found.",
        )
    return render


# ── POST /renders ─────────────────────────────────────────────────────────────

@router.post(
    "/{project_id}/renders",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Queue a new render job",
)
async def create_render(
    project_id: uuid.UUID,
    body: RenderCreateRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Queue a render job for the active timeline.

    The render is processed asynchronously by the Celery render worker.
    Poll GET /renders/{render_id} for progress (0-100%).
    When status=ready, call /renders/{render_id}/download for the download link.

    Supported platforms and output specs:
    - youtube:         1920×1080 MP4
    - youtube_shorts:  1080×1920 MP4 (vertical)
    - instagram:       1080×1080 MP4
    - instagram_reels: 1080×1920 MP4 (vertical)
    - tiktok:          1080×1920 MP4 (vertical)
    - facebook:        1280×720 MP4
    - custom:          uses timeline global_settings resolution
    """
    project = await _get_project_or_404(project_id, current_user.id, db)

    # Resolve which timeline version to render
    if body.timeline_id:
        try:
            tl_id = uuid.UUID(body.timeline_id)
        except ValueError:
            raise HTTPException(400, "Invalid timeline_id format.")
        tl_result = await db.execute(
            select(Timeline).where(
                Timeline.id == tl_id,
                Timeline.project_id == project_id,
            )
        )
        timeline = tl_result.scalar_one_or_none()
        if timeline is None:
            raise HTTPException(404, "Timeline version not found.")
    else:
        # Use the active timeline
        tl_result = await db.execute(
            select(Timeline)
            .where(
                Timeline.project_id == project_id,
                Timeline.is_active.is_(True),
            )
            .order_by(Timeline.version.desc())
            .limit(1)
        )
        timeline = tl_result.scalar_one_or_none()
        if timeline is None:
            raise HTTPException(
                status_code=404,
                detail="No timeline found. Save a timeline before rendering.",
            )

    # Determine resolution
    platform_resolutions = {
        RenderPlatform.YOUTUBE:          "1920x1080",
        RenderPlatform.YOUTUBE_SHORTS:   "1080x1920",
        RenderPlatform.INSTAGRAM:        "1080x1080",
        RenderPlatform.INSTAGRAM_REELS:  "1080x1920",
        RenderPlatform.TIKTOK:           "1080x1920",
        RenderPlatform.FACEBOOK:         "1280x720",
        RenderPlatform.CUSTOM:           body.resolution or "1920x1080",
    }
    resolution = platform_resolutions[body.platform]

    # Default render name
    render_name = body.name or f"{project.name} — {body.platform.value.replace('_', ' ').title()}"

    # Create Render row
    render = Render(
        project_id=project_id,
        timeline_id=timeline.id,
        name=render_name,
        platform=body.platform,
        status=RenderStatus.QUEUED,
        resolution=resolution,
        progress_percent=0.0,
    )
    db.add(render)
    await db.flush()   # get render.id before queuing
    await db.commit()
    await db.refresh(render)

    # Queue Celery task
    task_id: str = str(render.id) + "-offline"
    try:
        from tasks.render_task import render_video
        task = render_video.apply_async(
            kwargs={
                "render_id": str(render.id),
                "project_id": str(project_id),
                "platform": body.platform.value,
            },
            queue="render",
        )
        task_id = task.id
        # Store task ID on render row
        render.celery_task_id = task_id
        await db.commit()
        # Reload attributes — commit expires them, and _render_to_dict below
        # would otherwise trigger an implicit (sync) lazy-load in async context.
        await db.refresh(render)
    except Exception as exc:
        log.warning(
            "render_task_queue_failed",
            render_id=str(render.id),
            error=str(exc),
        )
        # Celery not running — leave as QUEUED; worker will pick up on start

    log.info(
        "render_queued",
        project_id=str(project_id),
        render_id=str(render.id),
        platform=body.platform.value,
        resolution=resolution,
        task_id=task_id,
    )
    return {
        **_render_to_dict(render),
        "task_id": task_id,
        "message": (
            f"Render queued for {body.platform.value}. "
            "Poll GET /renders/{render_id} for progress. "
            "Usually takes 1–5 minutes depending on video length."
        ),
    }


# ── GET /renders ──────────────────────────────────────────────────────────────

@router.get(
    "/{project_id}/renders",
    summary="List all render jobs for a project",
)
async def list_renders(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    status_filter: Optional[str] = Query(None, alias="status"),
) -> dict:
    """
    Return all render jobs for the project, newest first.
    Optionally filter by status: queued, processing, ready, error, cancelled.
    """
    await _get_project_or_404(project_id, current_user.id, db)

    query = (
        select(Render)
        .where(Render.project_id == project_id)
        .order_by(Render.created_at.desc())
    )
    if status_filter:
        try:
            s = RenderStatus(status_filter)
            query = query.where(Render.status == s)
        except ValueError:
            raise HTTPException(400, f"Invalid status filter: '{status_filter}'.")

    result = await db.execute(query)
    renders = result.scalars().all()

    return {
        "render_count": len(renders),
        "renders": [_render_to_dict(r) for r in renders],
    }


# ── GET /renders/{render_id} ──────────────────────────────────────────────────

@router.get(
    "/{project_id}/renders/{render_id}",
    summary="Get render status and progress",
)
async def get_render(
    project_id: uuid.UUID,
    render_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Return the current status and progress of a render job.

    Status values:
    - queued:     waiting for a render worker to pick up the job
    - processing: FFmpeg is encoding (check progress_percent)
    - ready:      encoding complete — call /download for the file
    - error:      encoding failed — see error_message
    - cancelled:  cancelled by user before completion
    """
    await _get_project_or_404(project_id, current_user.id, db)
    render = await _get_render_or_404(project_id, render_id, db)

    return {
        **_render_to_dict(render),
        "is_done": render.status in (RenderStatus.READY, RenderStatus.ERROR, RenderStatus.CANCELLED),
        "can_download": render.status == RenderStatus.READY,
    }


# ── GET /renders/{render_id}/download ────────────────────────────────────────

@router.get(
    "/{project_id}/renders/{render_id}/download",
    summary="Get a signed download URL for a completed render",
)
async def download_render(
    project_id: uuid.UUID,
    render_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    expires_in: int = Query(3600, ge=60, le=86400, description="URL validity in seconds"),
) -> dict:
    """
    Generate a pre-signed download URL for a completed render.

    The URL is valid for `expires_in` seconds (default 1 hour, max 24 hours).
    The render must have status=ready — call GET /renders/{render_id} first.
    """
    await _get_project_or_404(project_id, current_user.id, db)
    render = await _get_render_or_404(project_id, render_id, db)

    if render.status != RenderStatus.READY:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Render is not ready (status: {render.status.value}). "
                "Wait for status=ready before downloading."
            ),
        )
    if not render.storage_key:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Render completed but output file location is unknown. Contact support.",
        )

    # Generate a signed MinIO download URL for the renders bucket
    try:
        import boto3
        from botocore.config import Config
        from config import settings
        s3 = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
            region_name="us-east-1",
        )
        download_url = s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.S3_BUCKET_RENDERS,
                "Key": render.storage_key,
                "ResponseContentDisposition": (
                    f'attachment; filename="viraedit-{render.platform.value}.mp4"'
                ),
            },
            ExpiresIn=expires_in,
        )
    except Exception as exc:
        log.warning(
            "render_presign_failed",
            render_id=str(render_id),
            error=str(exc),
        )
        # Fallback: return the storage key so client can construct the URL
        download_url = f"/internal/renders/{render.storage_key}"

    log.info(
        "render_download_url_generated",
        render_id=str(render_id),
        expires_in=expires_in,
    )
    return {
        "render_id": str(render_id),
        "download_url": download_url,
        "expires_in_seconds": expires_in,
        "file_size_bytes": render.file_size,
        "duration_seconds": render.duration_seconds,
        "platform": render.platform.value,
        "resolution": render.resolution,
    }


# ── GET /renders/{render_id}/file ────────────────────────────────────────────

def _renders_s3_client():
    import boto3
    from botocore.config import Config
    from config import settings

    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        region_name=settings.S3_REGION or "us-east-1",
    )


@router.get(
    "/{project_id}/renders/{render_id}/file",
    summary="Stream a completed render MP4 (authenticated download)",
)
async def stream_render_file(
    project_id: uuid.UUID,
    render_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> StreamingResponse:
    """
    Stream the render MP4 through the API so the browser can save it reliably.

    Use this instead of the presigned MinIO URL when the frontend `download`
    attribute fails across origins.
    """
    await _get_project_or_404(project_id, current_user.id, db)
    render = await _get_render_or_404(project_id, render_id, db)

    if render.status != RenderStatus.READY:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Render is not ready (status: {render.status.value}). "
                "Wait for status=ready before downloading."
            ),
        )
    if not render.storage_key:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Render completed but output file location is unknown. Contact support.",
        )

    from config import settings

    def _fetch_object():
        client = _renders_s3_client()
        return client.get_object(
            Bucket=settings.S3_BUCKET_RENDERS,
            Key=render.storage_key,
        )

    try:
        obj = await asyncio.to_thread(_fetch_object)
    except Exception as exc:
        log.warning(
            "render_stream_failed",
            render_id=str(render_id),
            error=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not load render file from storage. Please try again.",
        ) from exc

    body = obj["Body"]
    safe_name = (render.name or f"viraedit-{render.platform.value}").replace('"', "").strip()
    filename = f"{safe_name or 'viraedit-export'}.mp4"

    def iter_chunks():
        try:
            for chunk in body.iter_chunks(chunk_size=1024 * 1024):
                if chunk:
                    yield chunk
        finally:
            body.close()

    log.info("render_stream_started", render_id=str(render_id), filename=filename)

    return StreamingResponse(
        iter_chunks(),
        media_type=obj.get("ContentType") or "video/mp4",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


# ── DELETE /renders/{render_id} ───────────────────────────────────────────────

@router.delete(
    "/{project_id}/renders/{render_id}",
    summary="Cancel or delete a render job",
)
async def cancel_render(
    project_id: uuid.UUID,
    render_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Cancel a render job.
    - QUEUED/PROCESSING → mark as CANCELLED, revoke Celery task
    - READY/ERROR → delete the render row and its output file from MinIO
    """
    await _get_project_or_404(project_id, current_user.id, db)
    render = await _get_render_or_404(project_id, render_id, db)

    if render.status in (RenderStatus.QUEUED, RenderStatus.PROCESSING):
        # Revoke the Celery task if it's running
        if render.celery_task_id:
            try:
                from celery_app import celery_app
                celery_app.control.revoke(render.celery_task_id, terminate=True)
                log.info("render_task_revoked", task_id=render.celery_task_id)
            except Exception as exc:
                log.warning("render_revoke_failed", error=str(exc))

        render.status = RenderStatus.CANCELLED
        await db.commit()
        action = "cancelled"

    else:
        # READY or ERROR — delete the row
        # (Storage cleanup is deferred to a background cleanup job in EP-7.3)
        await db.delete(render)
        await db.commit()
        action = "deleted"

    log.info(
        "render_%s", action,
        project_id=str(project_id),
        render_id=str(render_id),
    )
    return {
        "render_id": str(render_id),
        "action": action,
        "message": f"Render {action} successfully.",
    }
