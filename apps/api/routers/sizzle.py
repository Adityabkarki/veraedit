"""
ViraEdit — Sizzle reel generation router (Phase 05).

POST /api/v1/sizzle/generate   — queue highlight trailer generation
GET  /api/v1/sizzle/jobs/{id}  — poll generation job
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
from processors.music_library import MUSIC_MOODS
from schemas.ingest import IngestResponse, JobStatusResponse
from tasks.sizzle_tasks import generate_sizzle_task

router = APIRouter(prefix="/api/v1/sizzle", tags=["sizzle"])
log = structlog.get_logger("viraedit.sizzle")


class GenerateSizzleRequest(BaseModel):
    video_key: str = Field(..., min_length=3)
    project_id: str
    target_duration: float = Field(default=30.0, ge=15.0, le=60.0)
    music_mood: str = Field(default="upbeat")
    add_captions: bool = True


@router.post("/generate", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def generate_sizzle(
    req: GenerateSizzleRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> IngestResponse:
    """Queue a fast-cut highlight trailer from the best moments in a long video."""
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

    if req.music_mood not in MUSIC_MOODS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported music mood. Choose one of: {', '.join(sorted(MUSIC_MOODS))}",
        )

    job_id = uuid.uuid4()
    job = Job(
        id=job_id,
        project_id=project_id,
        type=JobType.GENERATE_SIZZLE,
        status=JobStatus.QUEUED,
        payload={
            "video_key": req.video_key,
            "target_duration": req.target_duration,
            "music_mood": req.music_mood,
            "add_captions": req.add_captions,
        },
    )
    db.add(job)
    await db.flush()

    generate_sizzle_task.delay(
        str(job_id),
        req.video_key,
        str(project_id),
        req.target_duration,
        req.music_mood,
        req.add_captions,
    )
    log.info("sizzle_generate_queued", job_id=str(job_id))
    return IngestResponse(job_id=str(job_id), status=JobStatus.QUEUED.value)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_sizzle_job(
    job_id: str,
    db: DbDep,
    current_user: CurrentUser,
) -> JobStatusResponse:
    """Poll sizzle reel generation job until the trailer is ready."""
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Job not found.")

    result = await db.execute(
        select(Job, Project.user_id)
        .join(Project, Job.project_id == Project.id)
        .where(Job.id == jid, Job.type == JobType.GENERATE_SIZZLE)
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
