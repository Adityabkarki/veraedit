"""
ViraEdit — Platform shorts extraction router (Phase 03).

POST /api/v1/shorts/extract       — queue multi-platform shorts extraction
GET  /api/v1/shorts/jobs/{job_id}   — poll extraction job
"""
from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from dependencies import CurrentUser, DbDep
from models import Job, Project, User
from models.job import JobStatus, JobType
from schemas.ingest import IngestResponse, JobStatusResponse
from tasks.shorts_tasks import extract_shorts_task

router = APIRouter(prefix="/api/v1/shorts", tags=["platform-shorts"])
log = structlog.get_logger("viraedit.platform_shorts")

VALID_PLATFORMS = frozenset({
    "tiktok",
    "instagram_reels",
    "youtube_shorts",
    "facebook_reels",
    "facebook_feed",
})


class ExtractShortsRequest(BaseModel):
    video_key: str = Field(..., min_length=3)
    project_id: str
    platforms: list[str] = Field(default_factory=lambda: ["tiktok", "instagram_reels"])
    max_clips: int = Field(default=5, ge=1, le=10)


@router.post("/extract", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def extract_shorts(
    req: ExtractShortsRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> IngestResponse:
    """Queue platform-correct short clip extraction for one long video."""
    try:
        project_id = uuid.UUID(req.project_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid project ID.")

    user: User = current_user  # type: ignore[assignment]
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Project not found.")

    platforms = [p for p in req.platforms if p in VALID_PLATFORMS]
    if not platforms:
        raise HTTPException(
            status_code=422,
            detail="Select at least one supported platform.",
        )

    job_id = uuid.uuid4()
    job = Job(
        id=job_id,
        project_id=project_id,
        type=JobType.EXTRACT_SHORTS,
        status=JobStatus.QUEUED,
        payload={
            "video_key": req.video_key,
            "platforms": platforms,
            "max_clips": req.max_clips,
        },
    )
    db.add(job)
    await db.flush()

    extract_shorts_task.delay(
        str(job_id),
        req.video_key,
        str(project_id),
        platforms,
        req.max_clips,
    )
    log.info("shorts_extract_queued", job_id=str(job_id), platforms=platforms)
    return IngestResponse(job_id=str(job_id), status=JobStatus.QUEUED.value)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_shorts_extract_job(
    job_id: str,
    db: DbDep,
    current_user: CurrentUser,
) -> JobStatusResponse:
    """Poll shorts extraction job until clips are ready."""
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Job not found.")

    result = await db.execute(
        select(Job, Project.user_id)
        .join(Project, Job.project_id == Project.id)
        .where(Job.id == jid, Job.type == JobType.EXTRACT_SHORTS)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    job, owner_id = row
    if owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found.")

    return JobStatusResponse(
        id=str(job.id),
        status=job.status.value if hasattr(job.status, "value") else str(job.status),
        result=job.result,
        error=job.error,
    )
