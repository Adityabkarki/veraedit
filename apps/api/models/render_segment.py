"""Per-segment render job tracking (Phase 14)."""
from __future__ import annotations

import enum
import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .render import Render


class RenderSegmentStatus(str, enum.Enum):
    PENDING = "pending"
    RENDERING = "rendering"
    COMPLETE = "complete"
    FAILED = "failed"


class RenderSegmentRecord(BaseModel):
    __tablename__ = "render_segments"

    render_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("renders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    segment_index: Mapped[int] = mapped_column(Integer, nullable=False)
    start_frame: Mapped[int] = mapped_column(Integer, nullable=False)
    end_frame: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[RenderSegmentStatus] = mapped_column(
        Enum(RenderSegmentStatus, name="render_segment_status_enum"),
        default=RenderSegmentStatus.PENDING,
        nullable=False,
        index=True,
    )
    output_storage_key: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    celery_task_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    render: Mapped["Render"] = relationship("Render", back_populates="segments")
