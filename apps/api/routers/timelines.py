"""
ViraEdit — Timelines router (EP-2.7 / T-1.4.1–T-1.4.4).

Timeline CRUD with undo/redo via a parent_id version chain:

  Save    → deactivate current, create new row (version+1, parent_id=current)
  Undo    → deactivate current, activate parent
  Redo    → deactivate current, activate most-recently-created child
  Versions→ full chain ordered by version ASC

Suggestion management (accept / reject / modify):
  Accept → mark suggestion ACCEPTED + optionally apply action to timeline
  Reject → mark suggestion REJECTED
  Modify → update suggestion action/title/description (status → MODIFIED)

All endpoints require project ownership.
"""
from __future__ import annotations

import json
import uuid
from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from dependencies import CurrentUser, DbDep
from exceptions import ProjectNotFoundError
from models import Project, Suggestion, Timeline
from models.suggestion import SuggestionStatus
from schemas.timeline import (
    SuggestionModifyRequest,
    TimelineDataModel,
    TimelineResponse,
    TimelineSaveRequest,
    TimelineVersionItem,
)

router = APIRouter(prefix="/api/v1/projects", tags=["timeline"])
log = structlog.get_logger("viraedit.timelines")


# ── GET /projects/{id}/timeline ───────────────────────────────────────────────

@router.get(
    "/{project_id}/timeline",
    summary="Get the active timeline for a project",
)
async def get_timeline(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Return the current active timeline data.

    If no timeline has been saved yet, returns an empty default timeline
    with video, audio, and captions tracks pre-created — ready for the
    frontend to populate after AI analysis completes.

    Can-undo / can-redo fields tell the client whether those actions are
    available without a second round-trip.
    """
    await _get_owned_project(project_id, current_user.id, db)
    tl = await _get_active_timeline(project_id, db)

    if tl is None:
        # No timeline yet — return empty default (not stored in DB yet)
        empty = TimelineDataModel.empty()
        return {
            "id": None,
            "version": 0,
            "label": "",
            "data": empty.model_dump(),
            "parent_id": None,
            "can_undo": False,
            "can_redo": False,
            "created_at": None,
            "updated_at": None,
        }

    can_undo = tl.parent_id is not None
    can_redo = await _has_child(tl.id, db)

    return _timeline_response(tl, can_undo=can_undo, can_redo=can_redo)


# ── PUT /projects/{id}/timeline ───────────────────────────────────────────────

@router.put(
    "/{project_id}/timeline",
    status_code=status.HTTP_200_OK,
    summary="Save a new timeline version",
)
async def save_timeline(
    project_id: uuid.UUID,
    body: TimelineSaveRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Save the timeline and create a new history entry.

    Each save:
      1. Deactivates the current active timeline row.
      2. Creates a new Timeline row (version+1) with parent_id → previous active.
      3. Returns the new timeline with updated can-undo / can-redo flags.

    The timeline data is validated against the full Pydantic schema before saving.
    A label (optional) is stored in the `name` field for the version list display.
    """
    await _get_owned_project(project_id, current_user.id, db)

    # Validate timeline data via Pydantic (body already validated by FastAPI)
    data_dict = body.data.model_dump()

    current = await _get_active_timeline(project_id, db)
    new_version = (current.version + 1) if current else 1
    parent_id = current.id if current else None

    # Deactivate current (if any)
    if current:
        current.is_active = False
        db.add(current)

    # Create new version
    new_tl = Timeline(
        project_id=project_id,
        name=body.label or f"Version {new_version}",
        version=new_version,
        data=data_dict,
        parent_id=parent_id,
        is_active=True,
    )
    db.add(new_tl)
    await db.commit()
    await db.refresh(new_tl)

    log.info(
        "timeline_saved",
        project_id=str(project_id),
        version=new_version,
        label=body.label,
    )

    return _timeline_response(
        new_tl,
        can_undo=parent_id is not None,
        can_redo=False,  # just saved — no future yet
    )


# ── POST /projects/{id}/timeline/undo ─────────────────────────────────────────

@router.post(
    "/{project_id}/timeline/undo",
    summary="Undo the last timeline save",
)
async def undo_timeline(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Revert the timeline to the previous saved version.

    Undo activates the parent of the current version and deactivates the
    current one. The current version remains in the database so Redo can
    restore it.

    Returns 409 if there is nothing to undo (already at the earliest version).
    """
    await _get_owned_project(project_id, current_user.id, db)
    current = await _get_active_timeline(project_id, db)

    if current is None or current.parent_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nothing to undo — you're already at the earliest version.",
        )

    # Load parent
    parent_result = await db.execute(
        select(Timeline).where(Timeline.id == current.parent_id)
    )
    parent = parent_result.scalar_one_or_none()
    if parent is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nothing to undo — the previous version could not be found.",
        )

    # Swap active flag
    current.is_active = False
    parent.is_active = True
    db.add(current)
    db.add(parent)
    await db.commit()
    await db.refresh(parent)

    parent_can_undo = parent.parent_id is not None
    parent_can_redo = True  # we just deactivated a child

    log.info(
        "timeline_undo",
        project_id=str(project_id),
        from_version=current.version,
        to_version=parent.version,
    )

    return _timeline_response(parent, can_undo=parent_can_undo, can_redo=parent_can_redo)


# ── POST /projects/{id}/timeline/redo ─────────────────────────────────────────

@router.post(
    "/{project_id}/timeline/redo",
    summary="Redo the last undone timeline change",
)
async def redo_timeline(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Reapply the most recently undone change.

    Redo finds the most recently created child of the current active version
    and activates it. Returns 409 if there's nothing to redo.
    """
    await _get_owned_project(project_id, current_user.id, db)
    current = await _get_active_timeline(project_id, db)

    if current is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nothing to redo — no timeline exists yet.",
        )

    # Find most-recently-created inactive child
    child_result = await db.execute(
        select(Timeline)
        .where(Timeline.parent_id == current.id, Timeline.is_active == False)  # noqa: E712
        .order_by(Timeline.created_at.desc())
        .limit(1)
    )
    child = child_result.scalar_one_or_none()

    if child is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nothing to redo — you're already at the latest version.",
        )

    # Swap active flag
    current.is_active = False
    child.is_active = True
    db.add(current)
    db.add(child)
    await db.commit()
    await db.refresh(child)

    child_can_redo = await _has_child(child.id, db)

    log.info(
        "timeline_redo",
        project_id=str(project_id),
        from_version=current.version,
        to_version=child.version,
    )

    return _timeline_response(
        child,
        can_undo=child.parent_id is not None,
        can_redo=child_can_redo,
    )


# ── GET /projects/{id}/timeline/versions ──────────────────────────────────────

@router.get(
    "/{project_id}/timeline/versions",
    summary="List all saved timeline versions",
)
async def list_timeline_versions(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Return all timeline versions for the project, ordered oldest → newest.

    The active version is flagged with `is_active: true`.
    Useful for building a "version history" panel in the UI.
    """
    await _get_owned_project(project_id, current_user.id, db)

    result = await db.execute(
        select(Timeline)
        .where(Timeline.project_id == project_id)
        .order_by(Timeline.version.asc())
    )
    timelines = result.scalars().all()

    return {
        "version_count": len(timelines),
        "versions": [
            TimelineVersionItem(
                id=str(tl.id),
                version=tl.version,
                label=tl.name or f"Version {tl.version}",
                is_active=tl.is_active,
                parent_id=str(tl.parent_id) if tl.parent_id else None,
                created_at=tl.created_at.isoformat(),
            ).model_dump()
            for tl in timelines
        ],
    }


# ── POST /suggestions/{id}/accept ─────────────────────────────────────────────

@router.post(
    "/{project_id}/assets/{asset_id}/suggestions/{suggestion_id}/accept",
    summary="Accept an AI suggestion",
)
async def accept_suggestion(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    suggestion_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Accept an AI suggestion.

    If the project has an active timeline, the suggestion's action is
    automatically applied and saved as a new timeline version.

    If no timeline exists yet (asset still processing), the suggestion
    is marked accepted but not applied — it will be applied when the
    timeline is first saved.

    Returns the updated suggestion + new timeline version (if applied).
    """
    from tasks.suggestion_apply import SuggestionApplyError, apply_suggestion

    await _get_owned_project(project_id, current_user.id, db)
    suggestion = await _get_suggestion(suggestion_id, asset_id, db)

    if suggestion.status == SuggestionStatus.REJECTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This suggestion has already been rejected and cannot be accepted.",
        )

    # Update suggestion status
    suggestion.status = SuggestionStatus.ACCEPTED
    db.add(suggestion)

    # Try to apply to active timeline
    new_timeline_version = None
    active_tl = await _get_active_timeline(project_id, db)

    if active_tl is not None and suggestion.action:
        try:
            new_data = apply_suggestion(
                suggestion.action,
                active_tl.data or {},
                suggestion_type=suggestion.type.value if suggestion.type else None,
            )

            # Save as new timeline version
            new_version = active_tl.version + 1
            active_tl.is_active = False
            db.add(active_tl)

            new_tl = Timeline(
                project_id=project_id,
                name=f"After: {suggestion.title[:60]}",
                version=new_version,
                data=new_data,
                parent_id=active_tl.id,
                is_active=True,
            )
            db.add(new_tl)

            # Mark suggestion as APPLIED
            suggestion.status = SuggestionStatus.APPLIED
            db.add(suggestion)

            await db.commit()
            await db.refresh(new_tl)

            new_timeline_version = _timeline_response(
                new_tl,
                can_undo=True,
                can_redo=False,
            )

            log.info(
                "suggestion_accepted_and_applied",
                suggestion_id=str(suggestion_id),
                new_timeline_version=new_version,
            )

        except SuggestionApplyError as e:
            # Apply failed — still mark as accepted, just not applied to timeline
            log.warning(
                "suggestion_apply_failed: %s suggestion_id=%s",
                str(e),
                str(suggestion_id),
            )
            await db.commit()
    else:
        await db.commit()
        log.info("suggestion_accepted_no_timeline", suggestion_id=str(suggestion_id))

    await db.refresh(suggestion)

    return {
        "suggestion_id": str(suggestion.id),
        "status": suggestion.status.value,
        "applied_to_timeline": new_timeline_version is not None,
        "timeline": new_timeline_version,
        "message": (
            "Suggestion accepted and applied to your timeline."
            if new_timeline_version
            else "Suggestion accepted. Apply it when you save the timeline."
        ),
    }


# ── POST /suggestions/{id}/reject ─────────────────────────────────────────────

@router.post(
    "/{project_id}/assets/{asset_id}/suggestions/{suggestion_id}/reject",
    summary="Reject an AI suggestion",
)
async def reject_suggestion(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    suggestion_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Reject an AI suggestion.

    Rejected suggestions are hidden from the main suggestions panel.
    This action is reversible — use the suggestions list filter to
    show rejected items and re-accept if needed.
    """
    await _get_owned_project(project_id, current_user.id, db)
    suggestion = await _get_suggestion(suggestion_id, asset_id, db)

    if suggestion.status == SuggestionStatus.APPLIED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This suggestion has already been applied to your timeline. "
                "Use undo to reverse it, then reject."
            ),
        )

    suggestion.status = SuggestionStatus.REJECTED
    db.add(suggestion)
    await db.commit()

    log.info("suggestion_rejected", suggestion_id=str(suggestion_id))

    return {
        "suggestion_id": str(suggestion.id),
        "status": suggestion.status.value,
        "message": "Suggestion dismissed.",
    }


# ── PUT /suggestions/{id} ─────────────────────────────────────────────────────

@router.put(
    "/{project_id}/assets/{asset_id}/suggestions/{suggestion_id}",
    summary="Modify a suggestion before accepting",
)
async def modify_suggestion(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    suggestion_id: uuid.UUID,
    body: SuggestionModifyRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Modify a suggestion's action, title, or description.

    Use this when you want to accept a suggestion but with different parameters
    (e.g., change the cut range by a few seconds, or update the hook text).

    After modifying, call the accept endpoint to apply the modified action.
    Status is set to MODIFIED to indicate the user has customised the AI suggestion.
    """
    await _get_owned_project(project_id, current_user.id, db)
    suggestion = await _get_suggestion(suggestion_id, asset_id, db)

    if body.action is not None:
        suggestion.action = body.action
    if body.title is not None:
        suggestion.title = body.title
    if body.description is not None:
        suggestion.description = body.description

    suggestion.status = SuggestionStatus.MODIFIED
    db.add(suggestion)
    await db.commit()
    await db.refresh(suggestion)

    log.info("suggestion_modified", suggestion_id=str(suggestion_id))

    return {
        "suggestion_id": str(suggestion.id),
        "type": suggestion.type.value if hasattr(suggestion.type, "value") else str(suggestion.type),
        "title": suggestion.title,
        "description": suggestion.description,
        "action": suggestion.action or {},
        "status": suggestion.status.value,
        "confidence": suggestion.confidence,
        "message": "Suggestion updated. Use the accept endpoint to apply it.",
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _timeline_response(
    tl: Timeline,
    can_undo: bool,
    can_redo: bool,
) -> dict:
    """Serialize a Timeline ORM object to response dict."""
    return {
        "id": str(tl.id),
        "version": tl.version,
        "label": tl.name or f"Version {tl.version}",
        "data": tl.data or {},
        "parent_id": str(tl.parent_id) if tl.parent_id else None,
        "can_undo": can_undo,
        "can_redo": can_redo,
        "created_at": tl.created_at.isoformat(),
        "updated_at": tl.updated_at.isoformat(),
    }


async def _get_active_timeline(project_id: uuid.UUID, db) -> Timeline | None:
    """Return the current active Timeline for a project, or None."""
    result = await db.execute(
        select(Timeline)
        .where(Timeline.project_id == project_id, Timeline.is_active == True)  # noqa: E712
        .order_by(Timeline.version.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _has_child(timeline_id: uuid.UUID, db) -> bool:
    """Return True if the given timeline has at least one inactive child (redo available)."""
    result = await db.execute(
        select(Timeline)
        .where(Timeline.parent_id == timeline_id, Timeline.is_active == False)  # noqa: E712
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _get_owned_project(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    db,
) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None or project.user_id != user_id:
        raise ProjectNotFoundError(project_id=str(project_id))
    return project


async def _get_suggestion(
    suggestion_id: uuid.UUID,
    asset_id: uuid.UUID,
    db,
) -> Suggestion:
    result = await db.execute(
        select(Suggestion).where(
            Suggestion.id == suggestion_id,
            Suggestion.asset_id == asset_id,
        )
    )
    suggestion = result.scalar_one_or_none()
    if suggestion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Suggestion {suggestion_id} not found for this asset.",
        )
    return suggestion
