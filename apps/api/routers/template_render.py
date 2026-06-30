"""
ViraEdit — Template render router (Phase 06).

POST /api/v1/render/from-template — queue style-template final assembly
GET  /api/v1/render/jobs/{job_id}   — poll render job
"""
from __future__ import annotations

import uuid
from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from dependencies import CurrentUser, DbDep
from models import Job, Project, User
from models.job import JobStatus, JobType
from schemas.ingest import IngestResponse, JobStatusResponse
from tasks.render_from_template_task import render_from_template_task

router = APIRouter(prefix="/api/v1/render", tags=["template-render"])
log = structlog.get_logger("viraedit.template_render")


class RenderFromTemplateRequest(BaseModel):
    template: dict[str, Any]
    resolved_assets: dict[str, Any] = Field(default_factory=dict)
    text_values: dict[str, str] = Field(default_factory=dict)
    project_id: str


@router.post("/from-template", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def render_from_template(
    req: RenderFromTemplateRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> IngestResponse:
    """Assemble a final video from a matched style template and resolved slot assets."""
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

    job_id = uuid.uuid4()
    job = Job(
        id=job_id,
        project_id=project_id,
        type=JobType.RENDER_FROM_TEMPLATE,
        status=JobStatus.QUEUED,
        payload={
            "template_id": req.template.get("template_id"),
            "slot_count": len(req.template.get("slots", [])),
        },
    )
    db.add(job)
    await db.flush()

    render_from_template_task.delay(
        str(job_id),
        str(project_id),
        req.template,
        req.resolved_assets,
        req.text_values,
    )
    log.info("render_from_template_queued", job_id=str(job_id))
    return IngestResponse(job_id=str(job_id), status=JobStatus.QUEUED.value)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_template_render_job(
    job_id: str,
    db: DbDep,
    current_user: CurrentUser,
) -> JobStatusResponse:
    """Poll template render job until the final video is ready."""
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Job not found.")

    result = await db.execute(
        select(Job, Project.user_id)
        .join(Project, Job.project_id == Project.id)
        .where(Job.id == jid, Job.type == JobType.RENDER_FROM_TEMPLATE)
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
