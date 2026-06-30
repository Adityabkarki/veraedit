"""
ViraEdit — Chapter extraction router (Phase 04).

POST /api/v1/chapters/extract     — queue standalone chapter clip extraction
GET  /api/v1/chapters/jobs/{id}   — poll extraction job
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
from processors.caption_renderer import CAPTION_STYLE_NAMES
from schemas.ingest import IngestResponse, JobStatusResponse
from tasks.chapter_tasks import extract_chapters_task

router = APIRouter(prefix="/api/v1/chapters", tags=["chapters"])
log = structlog.get_logger("viraedit.chapters")


class ExtractChaptersRequest(BaseModel):
    video_key: str = Field(..., min_length=3)
    project_id: str
    min_chapter_duration: float = Field(default=60.0, ge=30.0, le=600.0)
    caption_style: str = Field(default="minimal")


@router.post("/extract", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def extract_chapters(
    req: ExtractChaptersRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> IngestResponse:
    """Split a long video into standalone, captioned chapter clips."""
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

    if req.caption_style not in CAPTION_STYLE_NAMES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported caption style. Choose one of: {', '.join(CAPTION_STYLE_NAMES)}",
        )

    job_id = uuid.uuid4()
    job = Job(
        id=job_id,
        project_id=project_id,
        type=JobType.EXTRACT_CHAPTERS,
        status=JobStatus.QUEUED,
        payload={
            "video_key": req.video_key,
            "min_chapter_duration": req.min_chapter_duration,
            "caption_style": req.caption_style,
        },
    )
    db.add(job)
    await db.flush()

    extract_chapters_task.delay(
        str(job_id),
        req.video_key,
        str(project_id),
        req.min_chapter_duration,
        req.caption_style,
    )
    log.info("chapter_extract_queued", job_id=str(job_id))
    return IngestResponse(job_id=str(job_id), status=JobStatus.QUEUED.value)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_chapter_extract_job(
    job_id: str,
    db: DbDep,
    current_user: CurrentUser,
) -> JobStatusResponse:
    """Poll chapter extraction job until clips are ready."""
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Job not found.")

    result = await db.execute(
        select(Job, Project.user_id)
        .join(Project, Job.project_id == Project.id)
        .where(Job.id == jid, Job.type == JobType.EXTRACT_CHAPTERS)
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
