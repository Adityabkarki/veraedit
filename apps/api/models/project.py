"""
ViraEdit — Project model.
A project holds one or more assets, a timeline, suggestions, and renders.
"""
import enum
import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .asset import Asset
    from .cost import Cost
    from .embedding import Embedding
    from .highlight import Highlight
    from .project_media import ProjectMedia
    from .render import Render
    from .short import Short
    from .suggestion import Suggestion
    from .timeline import Timeline
    from .user import User


class ContentType(str, enum.Enum):
    PODCAST = "podcast"
    TUTORIAL = "tutorial"
    VLOG = "vlog"
    SHORTS = "shorts"
    INTERVIEW = "interview"
    OTHER = "other"


class EditorMode(str, enum.Enum):
    PODCAST = "podcast"
    SHORTS = "shorts"
    VISUAL_CREATOR = "visual_creator"
    FULL_EDITOR = "full_editor"
    TUTORIAL = "tutorial"
    QUICK_EXPORT = "quick_export"


class ProjectStatus(str, enum.Enum):
    DRAFT = "draft"
    PROCESSING = "processing"
    READY = "ready"
    ERROR = "error"


class Project(BaseModel):
    __tablename__ = "projects"

    # Ownership
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Classification — determines default editor layout and AI analysis style
    content_type: Mapped[ContentType] = mapped_column(
        Enum(ContentType, name="content_type_enum"), default=ContentType.OTHER, nullable=False
    )
    editor_mode: Mapped[EditorMode] = mapped_column(
        Enum(EditorMode, name="editor_mode_enum"), default=EditorMode.FULL_EDITOR, nullable=False
    )
    status: Mapped[ProjectStatus] = mapped_column(
        Enum(ProjectStatus, name="project_status_enum"), default=ProjectStatus.DRAFT, nullable=False
    )

    # Flexible project-level settings (target platforms, language, style prefs)
    settings: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, default=dict)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="projects")
    assets: Mapped[List["Asset"]] = relationship(
        "Asset", back_populates="project", cascade="all, delete-orphan"
    )
    timelines: Mapped[List["Timeline"]] = relationship(
        "Timeline", back_populates="project", cascade="all, delete-orphan"
    )
    suggestions: Mapped[List["Suggestion"]] = relationship(
        "Suggestion", back_populates="project", cascade="all, delete-orphan"
    )
    renders: Mapped[List["Render"]] = relationship(
        "Render", back_populates="project", cascade="all, delete-orphan"
    )
    shorts: Mapped[List["Short"]] = relationship(
        "Short", back_populates="project", cascade="all, delete-orphan"
    )
    highlights: Mapped[List["Highlight"]] = relationship(
        "Highlight", back_populates="project", cascade="all, delete-orphan"
    )
    costs: Mapped[List["Cost"]] = relationship(
        "Cost", back_populates="project", cascade="all, delete-orphan"
    )
    media_items: Mapped[List["ProjectMedia"]] = relationship(
        "ProjectMedia", back_populates="project", cascade="all, delete-orphan"
    )
    embeddings: Mapped[List["Embedding"]] = relationship(
        "Embedding", back_populates="project", cascade="all, delete-orphan"
    )
