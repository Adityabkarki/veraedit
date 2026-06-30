"""
ViraEdit — Style intelligence router (Phase 01).

POST /api/v1/style-intelligence/analyze — URL or uploaded video → v2 template
GET  /api/v1/style-intelligence/jobs/{job_id} — poll analysis job
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
from tasks.ingest_tasks import ingest_url_task
from tasks.style_tasks import analyze_style_task, chain_download_then_analyze

router = APIRouter(prefix="/api/v1/style-intelligence", tags=["style-intelligence"])
log = structlog.get_logger("viraedit.style_intelligence")


class AnalyzeReferenceRequest(BaseModel):
    url: str | None = Field(default=None, min_length=8)
    video_key: str | None = Field(default=None, min_length=3)
    project_id: str
    name: str = Field(default="Style template", max_length=255)


async def _get_owned_project(project_id: uuid.UUID, user: User, db) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


@router.post("/analyze", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def analyze_reference(
    req: AnalyzeReferenceRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> IngestResponse:
    """Paste a reference URL or pick an uploaded video to extract a v2 style template."""
    if not req.url and not req.video_key:
        raise HTTPException(
            status_code=422,
            detail="Provide either a reference URL or an uploaded video key.",
        )
    if req.url and req.video_key:
        raise HTTPException(
            status_code=422,
            detail="Provide only one input: a URL or a video key, not both.",
        )

    try:
        project_id = uuid.UUID(req.project_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid project ID.")

    user: User = current_user  # type: ignore[assignment]
    await _get_owned_project(project_id, user, db)

    job_id = uuid.uuid4()
    job = Job(
        id=job_id,
        project_id=project_id,
        type=JobType.STYLE_INTELLIGENCE,
        status=JobStatus.QUEUED,
        payload={
            "url": req.url,
            "video_key": req.video_key,
            "name": req.name,
        },
    )
    db.add(job)
    await db.flush()

    if req.url:
        download_job_id = uuid.uuid4()
        download_job = Job(
            id=download_job_id,
            project_id=project_id,
            type=JobType.INGEST_URL,
            status=JobStatus.QUEUED,
            payload={"url": req.url, "project_id": str(project_id)},
        )
        db.add(download_job)
        await db.flush()
        ingest_url_task.delay(str(download_job_id), req.url, str(project_id))
        chain_download_then_analyze.delay(
            str(job_id),
            str(download_job_id),
            str(project_id),
            str(user.id),
            req.name,
        )
    else:
        analyze_style_task.delay(
            str(job_id),
            req.video_key,
            str(project_id),
            str(user.id),
            req.name,
        )

    log.info("style_intelligence_queued", job_id=str(job_id), project_id=str(project_id))
    return IngestResponse(job_id=str(job_id), status=JobStatus.QUEUED.value)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_style_intelligence_job(
    job_id: str,
    db: DbDep,
    current_user: CurrentUser,
) -> JobStatusResponse:
    """Poll style intelligence job until the v2 template is ready."""
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Job not found.")

    result = await db.execute(
        select(Job, Project.user_id)
        .join(Project, Job.project_id == Project.id)
        .where(Job.id == jid, Job.type == JobType.STYLE_INTELLIGENCE)
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
