"""
Windowed DirectorTimeline access and trigger pagination (Phase 13).

GET /api/v1/timelines/{timeline_id}/window?startFrame=X&endFrame=Y
GET /api/v1/timelines/{timeline_id}/triggers?cursor=0&limit=50&status=realized
"""
from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from dependencies import CurrentUser, DbDep
from exceptions import ProjectNotFoundError
from models import DirectorTimelineRecord, Project
from services.director.timeline_entry_sync import query_windowed_entries_from_index
from services.director.timeline_window import build_windowed_timeline, paginate_triggers

router = APIRouter(prefix="/api/v1/timelines", tags=["timelines-window"])
log = structlog.get_logger("viraedit.timelines_window")


@router.get("/{timeline_id}/window")
async def get_timeline_window(
    timeline_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    start_frame: int = Query(..., alias="startFrame", ge=0),
    end_frame: int = Query(..., alias="endFrame", ge=0),
) -> dict:
    """Return track entries intersecting [startFrame, endFrame] plus timeline metadata."""
    record, _project = await _get_owned_timeline(timeline_id, current_user.id, db)
    timeline = record.data or {}

    indexed_tracks = await query_windowed_entries_from_index(
        db, timeline_id, start_frame, end_frame
    )
    windowed = build_windowed_timeline(timeline, start_frame, end_frame)

    if indexed_tracks:
        windowed["tracks"] = indexed_tracks

    return {
        "timelineId": str(record.id),
        "projectId": str(record.project_id),
        "version": record.version,
        "contentType": record.content_type,
        "timeline": windowed,
    }


@router.get("/{timeline_id}/triggers")
async def get_timeline_triggers_paginated(
    timeline_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    cursor: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status_filter: str | None = Query(None, alias="status"),
) -> dict:
    """Paginated TriggerLog for long projects."""
    record, _project = await _get_owned_timeline(timeline_id, current_user.id, db)
    page = paginate_triggers(
        record.data or {},
        cursor=cursor,
        limit=limit,
        status=status_filter,
    )
    return {
        "timelineId": str(record.id),
        "projectId": str(record.project_id),
        **page,
    }


async def _get_owned_timeline(
    timeline_id: uuid.UUID,
    user_id: uuid.UUID,
    db: DbDep,
) -> tuple[DirectorTimelineRecord, Project]:
    result = await db.execute(
        select(DirectorTimelineRecord).where(DirectorTimelineRecord.id == timeline_id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Timeline not found.")

    project_result = await db.execute(
        select(Project).where(Project.id == record.project_id, Project.user_id == user_id)
    )
    project = project_result.scalar_one_or_none()
    if project is None:
        raise ProjectNotFoundError(project_id=str(record.project_id))
    return record, project
