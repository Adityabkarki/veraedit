"""
ViraEdit — Director Engine timeline model.

Separate from the legacy editor Timeline — stores the resolved DirectorTimeline
JSON produced by runDirector() → resolveTimeline().
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .project import Project


class DirectorTimelineRecord(BaseModel):
    __tablename__ = "director_timelines"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    content_type: Mapped[str] = mapped_column(String(32), nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("director_timelines.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    has_manual_overrides: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    compiled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Optional MinIO archive key (projects/{id}/director-timelines/{id}.json)
    storage_key: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="director_timelines")
    parent: Mapped[Optional["DirectorTimelineRecord"]] = relationship(
        "DirectorTimelineRecord",
        remote_side="DirectorTimelineRecord.id",
        back_populates="branches",
    )
    branches: Mapped[list["DirectorTimelineRecord"]] = relationship(
        "DirectorTimelineRecord",
        back_populates="parent",
    )
