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
from services.director.compile_timeline import get_active_director_timeline
from services.director.overrides import (
    delete_timeline_entry,
    promote_trigger,
    reroll_broll_entry,
    swap_timeline_component,
)
from services.director.validate_timeline import validate_director_timeline

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
