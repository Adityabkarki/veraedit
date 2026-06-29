"""
ViraEdit — Style clone router (Module 02).

POST /api/v1/style-clone/analyze — queue vision-based template extraction
GET  /api/v1/style-clone/jobs/{job_id}   — poll clone job status
"""
from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from dependencies import CurrentUser, DbDep
from models import Job, Project
from models.job import JobStatus, JobType
from schemas.ingest import IngestResponse, JobStatusResponse
from tasks.style_clone_task import style_clone_task

router = APIRouter(prefix="/api/v1/style-clone", tags=["style-clone"])
log = structlog.get_logger("viraedit.style_clone")


class StyleCloneRequest(BaseModel):
    video_key: str = Field(..., min_length=3)
    project_id: str
    name: str = Field(default="Cloned template", max_length=255)


@router.post("/analyze", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def clone_style(
    req: StyleCloneRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> IngestResponse:
    """Download a reference video from MinIO and extract a reusable edit template."""
    try:
        project_id = uuid.UUID(req.project_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid project ID.")

    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Project not found.")

    job_id = uuid.uuid4()
    job = Job(
        id=job_id,
        project_id=project_id,
        type=JobType.STYLE_CLONE,
        status=JobStatus.QUEUED,
        payload={
            "video_key": req.video_key,
            "name": req.name,
        },
    )
    db.add(job)
    await db.flush()

    style_clone_task.delay(
        str(job_id),
        req.video_key,
        str(project_id),
        req.name,
    )
    log.info("style_clone_queued", job_id=str(job_id), project_id=str(project_id))
    return IngestResponse(job_id=str(job_id), status=JobStatus.QUEUED.value)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_style_clone_job(
    job_id: str,
    db: DbDep,
    current_user: CurrentUser,
) -> JobStatusResponse:
    """Poll style-clone job until template is ready."""
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Job not found.")

    result = await db.execute(
        select(Job, Project.user_id)
        .join(Project, Job.project_id == Project.id)
        .where(Job.id == jid, Job.type == JobType.STYLE_CLONE)
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
