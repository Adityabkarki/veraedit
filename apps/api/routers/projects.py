"""
ViraEdit — Projects router.

Endpoints:
    POST   /api/v1/projects              → create project
    GET    /api/v1/projects              → list user's projects
    GET    /api/v1/projects/{id}         → get project
    PUT    /api/v1/projects/{id}         → update project
    DELETE /api/v1/projects/{id}         → delete project (and all assets/timelines)

All endpoints require authentication (Bearer token).
"""
from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, Request, status
from sqlalchemy import select

from dependencies import CurrentUser, DbDep, StorageDep
from services.project_cleanup import purge_project_storage
from exceptions import ForbiddenError, ProjectNotFoundError
from models import Project
from schemas.projects import (
    ProjectCreateRequest,
    ProjectResponse,
    ProjectUpdateRequest,
)

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])
log = structlog.get_logger("viraedit.projects")


# ── POST /projects ────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new project",
)
async def create_project(
    body: ProjectCreateRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> ProjectResponse:
    """Create a new ViraEdit project owned by the current user."""
    project = Project(
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        content_type=body.content_type,
        editor_mode=body.editor_mode,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    log.info("project_created", project_id=str(project.id), user_id=str(current_user.id))
    return ProjectResponse.model_validate(project)


# ── GET /projects ─────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[ProjectResponse],
    summary="List your projects",
)
async def list_projects(
    db: DbDep,
    current_user: CurrentUser,
) -> list[ProjectResponse]:
    """Return all projects owned by the authenticated user, newest first."""
    result = await db.execute(
        select(Project)
        .where(Project.user_id == current_user.id)
        .order_by(Project.created_at.desc())
    )
    projects = result.scalars().all()
    return [ProjectResponse.model_validate(p) for p in projects]


# ── GET /projects/{id} ────────────────────────────────────────────────────────

@router.get(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Get a project",
)
async def get_project(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> ProjectResponse:
    """Return a single project. Returns 404 if it doesn't exist or you don't own it."""
    project = await _get_owned_project(project_id, current_user.id, db)
    return ProjectResponse.model_validate(project)


# ── PUT /projects/{id} ────────────────────────────────────────────────────────

@router.put(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Update a project",
)
async def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdateRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> ProjectResponse:
    """Update project name, description, content type, or editor mode."""
    project = await _get_owned_project(project_id, current_user.id, db)

    if body.name is not None:
        project.name = body.name
    if body.description is not None:
        project.description = body.description
    if body.content_type is not None:
        project.content_type = body.content_type
    if body.editor_mode is not None:
        project.editor_mode = body.editor_mode

    await db.commit()
    await db.refresh(project)

    log.info("project_updated", project_id=str(project.id))
    return ProjectResponse.model_validate(project)


# ── DELETE /projects/{id} ─────────────────────────────────────────────────────

@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a project",
    response_model=None,
)
async def delete_project(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    storage: StorageDep,
) -> None:
    """
    Permanently delete a project, all DB rows (cascade), and all MinIO objects.
    """
    project = await _get_owned_project(project_id, current_user.id, db)
    await purge_project_storage(project_id, db, storage)
    await db.delete(project)
    await db.commit()
    log.info("project_deleted", project_id=str(project_id), user_id=str(current_user.id))


# ── Helper ────────────────────────────────────────────────────────────────────

async def _get_owned_project(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    db,
) -> Project:
    """
    Load a project by ID and verify ownership.
    Returns 404 for both missing projects AND projects owned by someone else
    (to prevent information leakage — don't reveal that a project exists but
    belongs to a different user).
    """
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()

    if project is None or project.user_id != user_id:
        raise ProjectNotFoundError(project_id=str(project_id))

    return project
