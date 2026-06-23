"""
ViraEdit — Shorts API router (EP-1.5 / T-1.5.2).

Manage short-clip candidates across all assets in a project.

Endpoints:
  GET  /projects/{id}/shorts                      list all shorts
  POST /projects/{id}/shorts/{short_id}/approve   approve a short
  POST /projects/{id}/shorts/{short_id}/reject    reject a short
  POST /projects/{id}/shorts/{short_id}/render    queue render for a short

The GET /assets/{id}/shorts endpoint (asset-level) is in routers/assets.py (EP-2.4).
This router adds project-level shorts management (approve, reject, render).

Shorts workflow:
  1. AI detects shorts during asset analysis (EP-2.4 shorts engine)
  2. User reviews in Shorts Mode — sees virality scores, hook options
  3. User approves → status = APPROVED (ready to render)
  4. User calls /render → Celery queues a short render job
  5. When done → Render row with storage_key available for download
"""
from __future__ import annotations

import uuid
from typing import Optional

import structlog
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from dependencies import CurrentUser, DbDep
from exceptions import ProjectNotFoundError
from models import Project, Render, Short
from models.render import RenderPlatform, RenderStatus
from models.short import ShortStatus

router = APIRouter(prefix="/api/v1/projects", tags=["shorts"])
log = structlog.get_logger("viraedit.shorts")


# ── Request schemas ───────────────────────────────────────────────────────────

class ShortRenderRequest(BaseModel):
    """Body for POST /shorts/{id}/render."""
    platform: RenderPlatform = RenderPlatform.TIKTOK
    name: str = Field(default="", max_length=255)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _short_to_dict(s: Short) -> dict:
    return {
        "id": str(s.id),
        "asset_id": str(s.asset_id),
        "project_id": str(s.project_id),
        "start_time": s.start_time,
        "end_time": s.end_time,
        "duration_seconds": round(s.end_time - s.start_time, 2),
        "title": s.title,
        "hook": s.hook,
        "why_viral": s.why_viral,
        "viral_score": s.viral_score,
        "platform_scores": s.platform_scores or {},
        "status": s.status.value,
        "render_id": str(s.render_id) if s.render_id else None,
        "created_at": s.created_at.isoformat(),
    }


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


async def _get_short_or_404(project_id: uuid.UUID, short_id: uuid.UUID, db) -> Short:
    result = await db.execute(
        select(Short).where(
            Short.id == short_id,
            Short.project_id == project_id,
        )
    )
    short = result.scalar_one_or_none()
    if short is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Short not found.",
        )
    return short


# ── GET /shorts ───────────────────────────────────────────────────────────────

@router.get(
    "/{project_id}/shorts",
    summary="List all short-clip candidates for a project",
)
async def list_shorts(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    status_filter: Optional[str] = Query(None, alias="status"),
    min_score: Optional[float] = Query(None, ge=0.0, le=10.0, description="Minimum viral score"),
    platform: Optional[str] = Query(None, description="Sort by platform score (youtube, tiktok, etc.)"),
) -> dict:
    """
    List all short-clip candidates across all assets in the project.
    Ordered by viral score descending (best shorts first).

    Filter options:
    - status:     detected | approved | rejected | rendering | rendered
    - min_score:  only return shorts with viral_score >= this value
    - platform:   sort by platform-specific score instead of overall
    """
    await _get_project_or_404(project_id, current_user.id, db)

    query = (
        select(Short)
        .where(Short.project_id == project_id)
        .order_by(Short.viral_score.desc().nullslast(), Short.created_at.desc())
    )

    if status_filter:
        try:
            s = ShortStatus(status_filter)
            query = query.where(Short.status == s)
        except ValueError:
            raise HTTPException(400, f"Invalid status filter: '{status_filter}'.")

    if min_score is not None:
        query = query.where(Short.viral_score >= min_score)

    result = await db.execute(query)
    shorts = result.scalars().all()

    # Optional: sort by platform score if requested
    if platform and platform != "overall":
        shorts = sorted(
            shorts,
            key=lambda s: (s.platform_scores or {}).get(platform, 0.0),
            reverse=True,
        )

    return {
        "short_count": len(shorts),
        "shorts": [_short_to_dict(s) for s in shorts],
    }


# ── POST /shorts/{id}/approve ─────────────────────────────────────────────────

@router.post(
    "/{project_id}/shorts/{short_id}/approve",
    summary="Approve a short clip for rendering",
)
async def approve_short(
    project_id: uuid.UUID,
    short_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Mark a short as approved and ready to render.
    Approved shorts appear prominently in the Shorts Mode panel.
    Call POST /shorts/{id}/render to start the export.
    """
    await _get_project_or_404(project_id, current_user.id, db)
    short = await _get_short_or_404(project_id, short_id, db)

    if short.status == ShortStatus.APPROVED:
        return {**_short_to_dict(short), "message": "Short is already approved."}

    if short.status in (ShortStatus.RENDERING, ShortStatus.RENDERED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Short is already {short.status.value} and cannot be re-approved.",
        )

    short.status = ShortStatus.APPROVED
    await db.commit()
    await db.refresh(short)

    log.info("short_approved", project_id=str(project_id), short_id=str(short_id))
    return {
        **_short_to_dict(short),
        "message": "Short approved. Call POST /shorts/{id}/render to export it.",
    }


# ── POST /shorts/{id}/reject ──────────────────────────────────────────────────

@router.post(
    "/{project_id}/shorts/{short_id}/reject",
    summary="Reject a short clip",
)
async def reject_short(
    project_id: uuid.UUID,
    short_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Mark a short as rejected — removes it from the Shorts Mode panel.
    Rejected shorts stay in the database and can be re-activated.
    """
    await _get_project_or_404(project_id, current_user.id, db)
    short = await _get_short_or_404(project_id, short_id, db)

    if short.status == ShortStatus.RENDERED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This short has already been rendered. "
                "Delete the render first if you want to reject it."
            ),
        )

    short.status = ShortStatus.REJECTED
    await db.commit()
    await db.refresh(short)

    log.info("short_rejected", project_id=str(project_id), short_id=str(short_id))
    return {**_short_to_dict(short), "message": "Short dismissed."}


# ── POST /shorts/{id}/render ──────────────────────────────────────────────────

@router.post(
    "/{project_id}/shorts/{short_id}/render",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Queue a render job for a short clip",
)
async def render_short(
    project_id: uuid.UUID,
    short_id: uuid.UUID,
    body: ShortRenderRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Queue an export render for a specific short clip.

    The short must be APPROVED first (call POST /approve).
    Returns a render_id — poll GET /renders/{render_id} for progress.

    Default platform is TikTok (1080×1920 vertical).
    Also works for YouTube Shorts, Instagram Reels, Facebook Reels.
    """
    project = await _get_project_or_404(project_id, current_user.id, db)
    short = await _get_short_or_404(project_id, short_id, db)

    if short.status not in (ShortStatus.APPROVED, ShortStatus.DETECTED, ShortStatus.RENDERED):
        if short.status == ShortStatus.REJECTED:
            raise HTTPException(
                400, "Short is rejected. Approve it first before rendering."
            )
        if short.status == ShortStatus.RENDERING:
            raise HTTPException(
                409, "Short export is already in progress. Wait for it to finish."
            )

    # Resolve active timeline
    tl_result = await db.execute(
        select(
            __import__("models", fromlist=["Timeline"]).Timeline
        ).where(
            __import__("models", fromlist=["Timeline"]).Timeline.project_id == project_id,
            __import__("models", fromlist=["Timeline"]).Timeline.is_active.is_(True),
        ).order_by(
            __import__("models", fromlist=["Timeline"]).Timeline.version.desc()
        ).limit(1)
    )
    timeline = tl_result.scalar_one_or_none()
    if timeline is None:
        raise HTTPException(404, "No active timeline found. Save a timeline before rendering.")

    render_name = body.name or (
        f"{short.title or 'Short'} — {body.platform.value.replace('_', ' ').title()}"
    )

    # Create Render row
    platform_resolutions = {
        RenderPlatform.TIKTOK:           "1080x1920",
        RenderPlatform.YOUTUBE_SHORTS:   "1080x1920",
        RenderPlatform.INSTAGRAM_REELS:  "1080x1920",
        RenderPlatform.FACEBOOK:         "1280x720",
        RenderPlatform.YOUTUBE:          "1920x1080",
        RenderPlatform.INSTAGRAM:        "1080x1080",
        RenderPlatform.CUSTOM:           "1080x1920",
    }

    render = Render(
        project_id=project_id,
        timeline_id=timeline.id,
        name=render_name,
        platform=body.platform,
        status=RenderStatus.QUEUED,
        resolution=platform_resolutions.get(body.platform, "1080x1920"),
        progress_percent=0.0,
        render_settings={
            "short_id": str(short_id),
            "start_time": short.start_time,
            "end_time": short.end_time,
            "is_short": True,
        },
    )
    db.add(render)
    await db.flush()

    # Link render to short
    short.status = ShortStatus.RENDERING
    short.render_id = render.id
    await db.commit()
    await db.refresh(render)

    # Queue Celery task
    task_id = str(render.id) + "-offline"
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
        render.celery_task_id = task_id
        await db.commit()
    except Exception as exc:
        log.warning("short_render_queue_failed", error=str(exc))

    log.info(
        "short_render_queued",
        project_id=str(project_id),
        short_id=str(short_id),
        render_id=str(render.id),
        platform=body.platform.value,
    )
    return {
        "short_id": str(short_id),
        "render_id": str(render.id),
        "platform": body.platform.value,
        "task_id": task_id,
        "message": (
            f"Short render queued for {body.platform.value}. "
            "Poll GET /renders/{render_id} for progress."
        ),
    }
