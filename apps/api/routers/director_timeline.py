"""
Director timeline — GET active timeline and apply Phase 6 overrides.
"""
from __future__ import annotations

import uuid
from typing import Any, Literal

import structlog
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from dependencies import CurrentUser, DbDep
from exceptions import ProjectNotFoundError
from models import DirectorTimelineRecord, Project
from schemas.timeline import TimelineDataModel
from services.director.compile_timeline import get_active_director_timeline
from services.director.overrides import (
    delete_timeline_entry,
    promote_trigger,
    reroll_broll_entry,
    swap_timeline_component,
)
from services.director.validate_timeline import validate_director_timeline
from services.director.export_readiness import check_export_readiness

router = APIRouter(prefix="/api/v1/projects", tags=["director-timeline"])
log = structlog.get_logger("viraedit.director_timeline")


class DirectorTimelineOverrideRequest(BaseModel):
    action: Literal["delete_entry", "promote_trigger", "swap_component", "reroll_broll"]
    entry_id: str = ""
    trigger_id: str = ""
    component_id: str = ""
    search_query: str = ""
    props: dict[str, Any] = Field(default_factory=dict)


@router.get("/{project_id}/director-timeline")
async def get_project_director_timeline(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Return the active compiled Director timeline for a project."""
    await _get_owned_project(project_id, current_user.id, db)
    record = await get_active_director_timeline(project_id, db)
    if record is None:
        return {
            "timelineId": None,
            "timeline": None,
            "version": 0,
            "hasManualOverrides": False,
            "contentType": None,
        }

    return {
        "timelineId": str(record.id),
        "timeline": record.data,
        "version": record.version,
        "hasManualOverrides": record.has_manual_overrides,
        "contentType": record.content_type,
        "compiledAt": record.compiled_at.isoformat() if record.compiled_at else None,
    }


@router.get("/{project_id}/director-timeline/validation")
async def get_project_director_timeline_validation(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Run Phase 5 automated validation on the active Director timeline."""
    await _get_owned_project(project_id, current_user.id, db)
    record = await get_active_director_timeline(project_id, db)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No compiled Director timeline found. Run Auto Edit first.",
        )
    report = validate_director_timeline(record.data)
    result = report.to_dict()
    result["timelineId"] = str(record.id)
    result["version"] = record.version
    return result


class ExportReadinessRequest(BaseModel):
    auto_resolve: bool = Field(
        False,
        description="Apply Ken Burns or Topic Title Card fixes for static stretches",
    )


@router.get("/{project_id}/director-timeline/export-readiness")
async def get_project_export_readiness(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Pre-export completeness scan on the active Director timeline."""
    await _get_owned_project(project_id, current_user.id, db)
    record = await get_active_director_timeline(project_id, db)
    if record is None:
        return {
            "ready": True,
            "skipped": True,
            "reason": "No compiled Director timeline — legacy export path.",
            "issueCount": 0,
            "unresolvedCount": 0,
            "checklist": [],
            "issues": [],
        }

    report, _ = check_export_readiness(record.data, auto_resolve=False)
    payload = report.to_dict()
    payload["skipped"] = False
    payload["timelineId"] = str(record.id)
    payload["version"] = record.version
    return payload


@router.post("/{project_id}/director-timeline/export-readiness")
async def post_project_export_readiness(
    project_id: uuid.UUID,
    body: ExportReadinessRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Run completeness gate; optionally auto-fix and persist the Director timeline."""
    await _get_owned_project(project_id, current_user.id, db)
    record = await get_active_director_timeline(project_id, db)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No compiled Director timeline found. Run Auto Edit before export.",
        )

    report, timeline = check_export_readiness(record.data, auto_resolve=body.auto_resolve)
    if body.auto_resolve and report.auto_fixes_applied > 0:
        record.data = timeline
        record.has_manual_overrides = True
        from services.director.timeline_entry_sync import sync_timeline_entry_index

        await sync_timeline_entry_index(db, record.id, timeline)
        await db.commit()
        await db.refresh(record)
        log.info(
            "export_readiness_auto_fix",
            project_id=str(project_id),
            fixes=report.auto_fixes_applied,
        )

    payload = report.to_dict()
    payload["skipped"] = False
    payload["timelineId"] = str(record.id)
    payload["version"] = record.version
    if body.auto_resolve:
        payload["timeline"] = timeline
    return payload


@router.patch("/{project_id}/director-timeline")
async def patch_project_director_timeline(
    project_id: uuid.UUID,
    body: DirectorTimelineOverrideRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Apply a Phase 6 override to the active Director timeline."""
    await _get_owned_project(project_id, current_user.id, db)
    record = await get_active_director_timeline(project_id, db)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No compiled Director timeline found. Run Auto Edit first.",
        )

    data = record.data
    if body.action == "delete_entry":
        if not body.entry_id:
            raise HTTPException(status_code=422, detail="entry_id is required")
        data = delete_timeline_entry(data, body.entry_id)
    elif body.action == "promote_trigger":
        if not body.trigger_id:
            raise HTTPException(status_code=422, detail="trigger_id is required")
        data = promote_trigger(data, body.trigger_id, body.component_id or None)
    elif body.action == "swap_component":
        if not body.entry_id or not body.component_id:
            raise HTTPException(status_code=422, detail="entry_id and component_id are required")
        data = swap_timeline_component(data, body.entry_id, body.component_id, body.props or None)
    elif body.action == "reroll_broll":
        if not body.entry_id or not body.search_query.strip():
            raise HTTPException(status_code=422, detail="entry_id and search_query are required")
        data = reroll_broll_entry(
            data,
            body.entry_id,
            body.search_query.strip(),
            content_type=record.content_type,
        )

    record.data = data
    record.has_manual_overrides = True

    from services.director.timeline_entry_sync import sync_timeline_entry_index

    await sync_timeline_entry_index(db, record.id, data)

    await db.commit()
    await db.refresh(record)

    log.info(
        "director_timeline_override",
        project_id=str(project_id),
        action=body.action,
        timeline_id=str(record.id),
    )

    return {
        "timelineId": str(record.id),
        "timeline": record.data,
        "version": record.version,
        "hasManualOverrides": True,
    }


@router.get("/{project_id}/director-render-props")
async def get_director_render_props(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    width: int = 1920,
    height: int = 1080,
) -> dict[str, Any]:
    """
    Resolved DirectorRender composition props for live preview.
    Same resolution path as unified export (Preview/Export Parity Law).
    """
    from services.director.preview_props import (
        get_active_editor_timeline,
        resolve_director_render_props,
    )

    project = await _get_owned_project(project_id, current_user.id, db)
    timeline_data = await get_active_editor_timeline(project_id, db)
    if not timeline_data:
        timeline_data = TimelineDataModel.empty().model_dump()
        log.info(
            "director_render_props_synthetic_timeline",
            project_id=str(project_id),
        )

    try:
        return await resolve_director_render_props(
            project, timeline_data, db, width=width, height=height,
        )
    except Exception as exc:
        log.warning("director_render_props_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not resolve render props. Is the Remotion service running?",
        ) from exc


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
