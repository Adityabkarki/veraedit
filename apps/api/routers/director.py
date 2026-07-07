"""
ViraEdit — Director Engine router.

POST /api/v1/director/signals  — extract structured signals from transcript
POST /api/v1/director/cuts     — plan pacing-aware cuts from silences/fillers
POST /api/v1/director/compile  — run Director Engine → resolved DirectorTimeline
POST /api/v1/director/validate — Phase 5 automated timeline validation
POST /api/v1/director/multicam/sync — align camera feeds via audio cross-correlation
"""
from __future__ import annotations

import uuid
from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from dependencies import CurrentUser, DbDep
from exceptions import ProjectNotFoundError
from models import Project
from services.cuts.plan_cuts import plan_cuts_payload
from services.director.compile_timeline import (
    DirectorCompileError,
    ManualOverridesPresentError,
    compile_project_director_timeline,
)
from services.director.extract_signals import extract_director_signals
from services.director.validate_timeline import validate_director_timeline
from services.director.export_readiness import check_export_readiness
from services.multicam.sync import sync_camera_feeds

router = APIRouter(prefix="/api/v1/director", tags=["director"])
log = structlog.get_logger("viraedit.director")


class DirectorSignalsRequest(BaseModel):
    transcript_segments: list[dict[str, Any]] = Field(default_factory=list)
    words: list[dict[str, Any]] = Field(default_factory=list)
    video_duration: float = Field(0, ge=0)
    fps: float = Field(30, ge=12, le=60)
    audio_frames: list[dict[str, Any]] = Field(default_factory=list)


@router.post("/signals")
def post_director_signals(req: DirectorSignalsRequest) -> dict[str, Any]:
    """Extract Director signals for the TypeScript rule engine."""
    signals = extract_director_signals(
        segments=req.transcript_segments,
        words=req.words or None,
        duration_seconds=req.video_duration,
        audio_frames=req.audio_frames or None,
        fps=req.fps,
    )
    log.info(
        "director_signals_extracted",
        topic_shifts=len(signals.get("topicShifts", [])),
        stats=len(signals.get("stats", [])),
        emphasis=len(signals.get("emphasisMoments", [])),
    )
    return {"signals": signals}


class DirectorCutsRequest(BaseModel):
    silences: list[dict[str, Any]] = Field(default_factory=list)
    fillers: list[dict[str, Any]] = Field(default_factory=list)
    content_type: str = "podcast"
    profile: str = ""


@router.post("/cuts")
def post_director_cuts(req: DirectorCutsRequest) -> dict[str, Any]:
    """Plan silence/filler cuts using the active PacingProfile."""
    plan = plan_cuts_payload(
        silences=req.silences,
        fillers=req.fillers,
        content_type=req.content_type,
        profile_name=req.profile or None,
    )
    log.info(
        "director_cuts_planned",
        profile=plan["profile"],
        silence_cuts=len(plan["silenceCuts"]),
        filler_actions=len(plan["fillerActions"]),
    )
    return {"cuts": plan}


class DirectorCompileRequest(BaseModel):
    project_id: uuid.UUID
    content_type: str | None = Field(
        None,
        description="Director pillar override: podcast|consultancy|social|showcase",
    )
    density: str = Field("balanced", pattern="^(minimalist|balanced|immersive)$")
    pacing: str | None = Field(None, pattern="^(relaxed|balanced|aggressive)$")
    signals: dict[str, Any] | None = Field(
        None,
        description="Pre-computed signals payload; extracted from transcript when omitted",
    )
    asset_id: uuid.UUID | None = None
    overwrite: bool = Field(
        False,
        description="Replace active timeline even when manual overrides are present",
    )
    fps: float = Field(30, ge=12, le=60)
    width: int | None = Field(None, ge=320, le=3840)
    height: int | None = Field(None, ge=320, le=3840)


@router.post("/compile")
async def post_director_compile(
    req: DirectorCompileRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Compile a DirectorTimeline for a project.

    Chains signal extraction → runDirector() → resolveTimeline() in remotion-service,
    then persists the result with version chaining. Returns 409 when manual overrides
    exist on the active timeline unless overwrite=true.
    """
    project = await _get_owned_project(req.project_id, current_user.id, db)

    try:
        return await compile_project_director_timeline(
            project=project,
            db=db,
            content_type=req.content_type,
            density=req.density,
            pacing=req.pacing,
            signals=req.signals,
            asset_id=req.asset_id,
            overwrite=req.overwrite,
            fps=req.fps,
            width=req.width,
            height=req.height,
        )
    except ManualOverridesPresentError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": exc.code,
                "message": exc.message,
                "existingTimelineId": str(exc.existing_timeline_id),
            },
        ) from exc
    except DirectorCompileError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    except RuntimeError as exc:
        log.error("director_compile_runtime_error", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "remotion_compile_failed",
                "message": "Director compile failed. Ensure the Remotion service is running.",
            },
        ) from exc


class MulticamFeedInput(BaseModel):
    id: str
    label: str = ""
    sourceUrl: str = ""
    rmsEnvelope: list[float] = Field(default_factory=list)
    speakerId: str = ""


class MulticamSyncRequest(BaseModel):
    feeds: list[MulticamFeedInput] = Field(default_factory=list)
    reference_index: int = 0
    fps: float = Field(30, ge=12, le=60)


@router.post("/multicam/sync")
def post_multicam_sync(req: MulticamSyncRequest) -> dict[str, Any]:
    """Align multicam feeds to a shared timeline (Multicam Sync Law)."""
    payload = [f.model_dump() for f in req.feeds]
    synced = sync_camera_feeds(
        payload,
        reference_index=req.reference_index,
        fps=req.fps,
    )
    log.info("multicam_sync_complete", feed_count=len(synced))
    return {"feeds": synced}


class DirectorValidateRequest(BaseModel):
    timeline: dict[str, Any] = Field(default_factory=dict)


@router.post("/validate")
def post_director_validate(req: DirectorValidateRequest) -> dict[str, Any]:
    """Run Phase 5 automated validation checks on a DirectorTimeline JSON."""
    if not req.timeline:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "missing_timeline", "message": "timeline payload is required"},
        )
    report = validate_director_timeline(req.timeline)
    return report.to_dict()


class DirectorExportReadinessRequest(BaseModel):
    timeline: dict[str, Any] = Field(default_factory=dict)
    auto_resolve: bool = Field(
        False,
        description="Insert Topic Title Cards for auto-fixable static stretches",
    )


@router.post("/export-readiness")
def post_director_export_readiness(req: DirectorExportReadinessRequest) -> dict[str, Any]:
    """Pre-export completeness gate — static stretches, B-roll confidence, fallback gaps."""
    if not req.timeline:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "missing_timeline", "message": "timeline payload is required"},
        )
    report, timeline = check_export_readiness(req.timeline, auto_resolve=req.auto_resolve)
    payload = report.to_dict()
    if req.auto_resolve and report.auto_fixes_applied:
        payload["timeline"] = timeline
    return payload


async def _get_owned_project(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    db: DbDep,
) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user_id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise ProjectNotFoundError()
    return project
