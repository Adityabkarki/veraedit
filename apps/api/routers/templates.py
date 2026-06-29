"""
ViraEdit — Template CRUD router (Module 02).
"""
from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from dependencies import CurrentUser, DbDep
from models import Project, Template

router = APIRouter(prefix="/api/v1/templates", tags=["templates"])
log = structlog.get_logger("viraedit.templates")


class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    project_id: str | None = None
    data: dict


class TemplateOut(BaseModel):
    id: str
    name: str
    project_id: str | None
    data: dict | None
    thumb_key: str | None = None
    is_public: bool = False


@router.post("/", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(
    req: TemplateCreate,
    db: DbDep,
    current_user: CurrentUser,
) -> TemplateOut:
    """Save a cloned or hand-built template."""
    project_uuid = None
    if req.project_id:
        try:
            project_uuid = uuid.UUID(req.project_id)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid project ID.")
        owned = await db.execute(
            select(Project).where(
                Project.id == project_uuid,
                Project.user_id == current_user.id,
            )
        )
        if owned.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Project not found.")

    tmpl = Template(
        name=req.name,
        project_id=project_uuid,
        data=req.data,
    )
    db.add(tmpl)
    await db.flush()
    return _to_out(tmpl)


@router.get("/", response_model=list[TemplateOut])
async def list_templates(
    db: DbDep,
    current_user: CurrentUser,
) -> list[TemplateOut]:
    """List templates for the user's projects."""
    result = await db.execute(
        select(Template)
        .join(Project, Template.project_id == Project.id, isouter=True)
        .where(
            (Project.user_id == current_user.id)
            | (Template.is_public.is_(True))
            | (Template.project_id.is_(None))
        )
        .order_by(Template.created_at.desc())
    )
    return [_to_out(t) for t in result.scalars().unique().all()]


@router.get("/{template_id}", response_model=TemplateOut)
async def get_template(
    template_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> TemplateOut:
    tmpl = await _get_owned_template(template_id, current_user.id, db)
    return _to_out(tmpl)


async def _get_owned_template(
    template_id: uuid.UUID,
    user_id: uuid.UUID,
    db,
) -> Template:
    result = await db.execute(
        select(Template, Project.user_id)
        .join(Project, Template.project_id == Project.id, isouter=True)
        .where(Template.id == template_id)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Template not found.")
    tmpl, owner_id = row
    if tmpl.is_public or owner_id == user_id or tmpl.project_id is None:
        return tmpl
    raise HTTPException(status_code=404, detail="Template not found.")


def _to_out(tmpl: Template) -> TemplateOut:
    return TemplateOut(
        id=str(tmpl.id),
        name=tmpl.name,
        project_id=str(tmpl.project_id) if tmpl.project_id else None,
        data=tmpl.data,
        thumb_key=tmpl.thumb_key,
        is_public=tmpl.is_public,
    )
