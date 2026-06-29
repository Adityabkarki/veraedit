"""
ViraEdit — Video ingestion router.

POST /api/v1/ingest/url     — queue URL download (YouTube, TikTok, Instagram)
POST /api/v1/ingest/upload  — direct file upload (streams to MinIO)
GET  /api/v1/ingest/jobs/{job_id} — poll job status
"""
from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select

from dependencies import CurrentUser, DbDep, StorageDep
from exceptions import ProjectNotFoundError
from models import Job, Project
from models.job import JobStatus, JobType
from schemas.ingest import IngestResponse, IngestURLRequest, JobStatusResponse
from storage import BUCKET_MEDIA, validate_file
from tasks.ingest_tasks import ingest_url_task, process_uploaded_file_task

router = APIRouter(prefix="/api/v1/ingest", tags=["ingest"])
log = structlog.get_logger("viraedit.ingest")

MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB per module spec


async def _get_owned_project(project_id: uuid.UUID, user_id: uuid.UUID, db) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user_id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise ProjectNotFoundError()
    return project


@router.post("/url", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_url(
    req: IngestURLRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> IngestResponse:
    """Queue a social-media or direct video URL for download and processing."""
    try:
        project_id = uuid.UUID(req.project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid project ID.",
        )

    await _get_owned_project(project_id, current_user.id, db)

    job_id = uuid.uuid4()
    job = Job(
        id=job_id,
        project_id=project_id,
        type=JobType.INGEST_URL,
        status=JobStatus.QUEUED,
        payload={"url": req.url, "project_id": str(project_id)},
    )
    db.add(job)
    await db.flush()

    ingest_url_task.delay(str(job_id), req.url, str(project_id))
    log.info("ingest_url_queued", job_id=str(job_id), project_id=str(project_id))

    return IngestResponse(job_id=str(job_id), status=JobStatus.QUEUED.value)


@router.post("/upload", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_file(
    db: DbDep,
    current_user: CurrentUser,
    storage: StorageDep,
    file: UploadFile = File(...),
    project_id: str = Form(...),
) -> IngestResponse:
    """Upload a video file through the API and queue metadata extraction."""
    try:
        pid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid project ID.",
        )

    await _get_owned_project(pid, current_user.id, db)

    filename = file.filename or "upload.mp4"
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File is too large. Maximum size is 2 GB.",
        )

    mime_type = file.content_type or "video/mp4"
    validate_file(filename, mime_type, len(content))

    job_id = uuid.uuid4()
    raw_key = f"projects/{project_id}/raw/{job_id}_{filename}"

    await storage.put_object(raw_key, content, mime_type)

    job = Job(
        id=job_id,
        project_id=pid,
        type=JobType.UPLOAD_FILE,
        status=JobStatus.QUEUED,
        payload={"raw_key": raw_key, "filename": filename},
    )
    db.add(job)
    await db.flush()

    process_uploaded_file_task.delay(str(job_id), raw_key, project_id, filename)
    log.info("ingest_upload_queued", job_id=str(job_id), project_id=project_id)

    return IngestResponse(job_id=str(job_id), status=JobStatus.QUEUED.value)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job(
    job_id: str,
    db: DbDep,
    current_user: CurrentUser,
) -> JobStatusResponse:
    """Poll ingestion job status until done or failed."""
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    result = await db.execute(
        select(Job, Project.user_id)
        .join(Project, Job.project_id == Project.id)
        .where(Job.id == jid)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    job, owner_id = row
    if owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    return JobStatusResponse(
        id=str(job.id),
        status=job.status.value if hasattr(job.status, "value") else str(job.status),
        result=job.result,
        error=job.error,
    )
