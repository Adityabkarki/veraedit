"""
ViraEdit — Text-based editor router (Module 04).

POST /api/v1/text-editor/apply-cuts     — queue FFmpeg cut job
POST /api/v1/text-editor/detect-fillers — detect filler word cuts
POST /api/v1/text-editor/detect-silences — detect silence regions
GET  /api/v1/text-editor/jobs/{id}      — poll cut job
"""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any, Optional

import structlog
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from dependencies import CurrentUser, DbDep
from models import Job, Project
from models.job import JobStatus, JobType
from processors.storage_helpers import storage_sync
from processors.text_editor import detect_fillers, detect_silences
from schemas.ingest import IngestResponse, JobStatusResponse
from tasks.cut_tasks import apply_cuts_task

router = APIRouter(prefix="/api/v1/text-editor", tags=["text-editor"])
log = structlog.get_logger("viraedit.text_editor")


class ApplyCutsRequest(BaseModel):
    video_key: str = Field(..., min_length=3)
    cuts: list[dict[str, Any]]
    project_id: str


class DetectFillersRequest(BaseModel):
    words: list[dict[str, Any]]
    language: str = "ne"


class DetectSilencesRequest(BaseModel):
    video_key: str = Field(..., min_length=3)
    min_silence_duration: float = 0.8
    silence_threshold_db: float = -35


async def _verify_project(db: DbDep, project_id: str, user_id: uuid.UUID) -> uuid.UUID:
    try:
        pid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid project ID.")
    result = await db.execute(
        select(Project).where(Project.id == pid, Project.user_id == user_id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return pid


@router.post("/apply-cuts", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def apply_cuts_endpoint(
    req: ApplyCutsRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> IngestResponse:
    """Queue FFmpeg job to remove selected transcript cut ranges from the source video."""
    if not req.cuts:
        raise HTTPException(status_code=422, detail="At least one cut range is required.")

    project_id = await _verify_project(db, req.project_id, current_user.id)
    job_id = uuid.uuid4()
    job = Job(
        id=job_id,
        project_id=project_id,
        type=JobType.APPLY_CUTS,
        status=JobStatus.QUEUED,
        payload={"video_key": req.video_key, "cut_count": len(req.cuts)},
    )
    db.add(job)
    await db.flush()

    apply_cuts_task.delay(str(job_id), req.video_key, req.cuts, str(project_id))
    log.info("apply_cuts_queued", job_id=str(job_id), cut_count=len(req.cuts))
    return IngestResponse(job_id=str(job_id), status=JobStatus.QUEUED.value)


@router.post("/detect-fillers")
def fillers_endpoint(req: DetectFillersRequest) -> dict[str, Any]:
    """Detect filler words in a word-timestamp list (Nepali + English)."""
    cuts = detect_fillers(req.words, req.language)
    return {"cuts": cuts, "count": len(cuts)}


@router.post("/detect-silences")
async def silences_endpoint(
    req: DetectSilencesRequest,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Download video from storage and detect silent regions."""
    _ = current_user  # auth required
    local_path: Path | None = None
    try:
        local_path = storage_sync.download_to_temp(req.video_key, "silence_detect")
        silences = detect_silences(
            local_path,
            req.min_silence_duration,
            req.silence_threshold_db,
        )
        return {"silences": silences, "count": len(silences)}
    finally:
        if local_path and local_path.exists():
            try:
                local_path.unlink()
            except OSError:
                pass


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_cut_job(
    job_id: str,
    db: DbDep,
    current_user: CurrentUser,
) -> JobStatusResponse:
    """Poll apply-cuts job until the edited video is ready."""
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Job not found.")

    result = await db.execute(
        select(Job, Project.user_id)
        .join(Project, Job.project_id == Project.id)
        .where(Job.id == jid, Job.type == JobType.APPLY_CUTS)
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
