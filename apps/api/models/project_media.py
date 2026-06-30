"""
ViraEdit — Per-project supplementary media items (images, audio, extra video).

Unlike LibraryAsset (user-wide tagged pool), ProjectMedia items belong to a single
project and are uploaded for use in that project's timeline.
"""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .project import Project
    from .user import User


class ProjectMedia(BaseModel):
    __tablename__ = "project_media"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    storage_key: Mapped[str] = mapped_column(String(1000), nullable=False)
    thumb_key: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    file_name: Mapped[str] = mapped_column(String(500), nullable=False)
    media_type: Mapped[str] = mapped_column(String(20), nullable=False)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Float, nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="media_items")
    user: Mapped["User"] = relationship("User")
