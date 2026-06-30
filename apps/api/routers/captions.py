"""
ViraEdit — Captions router (Module 03).

POST /api/v1/captions/transcribe  — queue STT job
POST /api/v1/captions/render      — burn captions into video
GET  /api/v1/captions/styles      — list burn-in style presets
GET  /api/v1/captions/jobs/{id}   — poll job status
GET  /api/v1/captions/jobs/{id}/srt — download SRT transcript
"""
from __future__ import annotations

import uuid
from typing import Any, Optional

import structlog
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from config import settings
from dependencies import CurrentUser, DbDep
from models import Job, Project
from models.job import JobStatus, JobType
from processors.caption_renderer import CAPTION_STYLE_NAMES, words_to_srt
from processors.storage_helpers import storage_sync
from schemas.ingest import IngestResponse, JobStatusResponse
from tasks.caption_tasks import render_captions_task, transcribe_task

router = APIRouter(prefix="/api/v1/captions", tags=["captions"])
log = structlog.get_logger("viraedit.captions")


class TranscribeRequest(BaseModel):
    video_key: str = Field(..., min_length=3)
    project_id: str
    language: Optional[str] = None


class RenderCaptionsRequest(BaseModel):
    video_key: str = Field(..., min_length=3)
    words: list[dict[str, Any]]
    style: str = "hormozi"
    project_id: str


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


async def _get_owned_job(
    db: DbDep,
    job_id: str,
    user_id: uuid.UUID,
    allowed_types: set[JobType],
) -> Job:
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Job not found.")

    result = await db.execute(
        select(Job, Project.user_id)
        .join(Project, Job.project_id == Project.id)
        .where(Job.id == jid, Job.type.in_(allowed_types))
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    job, owner_id = row
    if owner_id != user_id:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@router.post("/transcribe", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def transcribe(
    req: TranscribeRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> IngestResponse:
    """Queue video transcription (ElevenLabs Scribe, Nepali default)."""
    project_id = await _verify_project(db, req.project_id, current_user.id)
    job_id = uuid.uuid4()
    job = Job(
        id=job_id,
        project_id=project_id,
        type=JobType.TRANSCRIBE,
        status=JobStatus.QUEUED,
        payload={
            "video_key": req.video_key,
            "language": req.language,
        },
    )
    db.add(job)
    await db.flush()

    transcribe_task.delay(str(job_id), req.video_key, str(project_id), req.language)
    log.info("caption_transcribe_queued", job_id=str(job_id))
    return IngestResponse(job_id=str(job_id), status=JobStatus.QUEUED.value)


@router.post("/render", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def render(
    req: RenderCaptionsRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> IngestResponse:
    """Queue FFmpeg caption burn-in with a named style preset."""
    if req.style not in CAPTION_STYLE_NAMES:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown caption style. Choose one of: {', '.join(CAPTION_STYLE_NAMES)}",
        )
    project_id = await _verify_project(db, req.project_id, current_user.id)
    job_id = uuid.uuid4()
    job = Job(
        id=job_id,
        project_id=project_id,
        type=JobType.RENDER_CAPTIONS,
        status=JobStatus.QUEUED,
        payload={
            "video_key": req.video_key,
            "style": req.style,
            "word_count": len(req.words),
        },
    )
    db.add(job)
    await db.flush()

    render_captions_task.delay(
        str(job_id),
        req.video_key,
        req.words,
        req.style,
        str(project_id),
    )
    log.info("caption_render_queued", job_id=str(job_id), style=req.style)
    return IngestResponse(job_id=str(job_id), status=JobStatus.QUEUED.value)


@router.get("/styles")
def caption_styles() -> dict[str, list[str]]:
    """Return available FFmpeg burn-in caption style names."""
    return {"styles": CAPTION_STYLE_NAMES}


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_caption_job(
    job_id: str,
    db: DbDep,
    current_user: CurrentUser,
) -> JobStatusResponse:
    """Poll transcription or render job until complete."""
    job = await _get_owned_job(
        db,
        job_id,
        current_user.id,
        {JobType.TRANSCRIBE, JobType.RENDER_CAPTIONS},
    )
    return JobStatusResponse(
        id=str(job.id),
        status=job.status.value if hasattr(job.status, "value") else str(job.status),
        result=job.result,
        error=job.error,
    )


@router.get("/jobs/{job_id}/srt")
async def download_srt(
    job_id: str,
    db: DbDep,
    current_user: CurrentUser,
) -> PlainTextResponse:
    """Download SRT transcript for a completed transcription job."""
    job = await _get_owned_job(
        db,
        job_id,
        current_user.id,
        {JobType.TRANSCRIBE},
    )
    if job.status != JobStatus.DONE:
        raise HTTPException(
            status_code=409,
            detail="Transcription is not complete yet. Poll the job status first.",
        )

    result = job.result or {}
    srt_key = result.get("srt_key")
    if srt_key:
        import boto3
        from botocore.config import Config

        client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
            region_name=settings.S3_REGION,
        )
        obj = client.get_object(Bucket=settings.S3_BUCKET_MEDIA, Key=srt_key)
        body = obj["Body"].read().decode("utf-8")
        return PlainTextResponse(body, media_type="text/plain; charset=utf-8")

    segments = result.get("segments") or []
    if not segments and result.get("words"):
        from processors.caption_renderer import segments_from_words

        segments = segments_from_words(result["words"])
    if not segments:
        raise HTTPException(status_code=404, detail="No transcript segments found for this job.")

    return PlainTextResponse(words_to_srt(segments), media_type="text/plain; charset=utf-8")
