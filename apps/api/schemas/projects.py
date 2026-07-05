"""ViraEdit — Project request/response schemas."""
from __future__ import annotations

import uuid
from typing import Optional

from pydantic import BaseModel, Field

from models.project import ContentType, EditorMode, ProjectStatus


class ProjectCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Project name")
    description: Optional[str] = Field(None, max_length=2000)
    content_type: ContentType = Field(ContentType.OTHER, description="Type of content")
    editor_mode: EditorMode = Field(EditorMode.FULL_EDITOR, description="Initial editor layout")

    model_config = {"json_schema_extra": {"example": {
        "name": "Nepali Podcast Ep 42",
        "description": "Weekly tech news in Nepali",
        "content_type": "podcast",
        "editor_mode": "podcast",
    }}}


class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    content_type: Optional[ContentType] = None
    editor_mode: Optional[EditorMode] = None
    settings: Optional[dict] = Field(
        None,
        description="Project settings JSON (merged with existing). useDirectorEngine gates the Director pipeline.",
    )


class ProjectResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    description: Optional[str]
    content_type: ContentType
    editor_mode: EditorMode
    status: ProjectStatus
    settings: Optional[dict] = None

    model_config = {"from_attributes": True}
