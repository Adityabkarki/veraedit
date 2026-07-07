"""Denormalized timeline entry index for windowed queries (Phase 13)."""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel


class TimelineEntryIndex(BaseModel):
    """
    One row per DirectorTimeline track entry — regenerated from canonical JSONB on write.
    Never edited independently (Windowed Timeline Access Law).
    """

    __tablename__ = "timeline_entry_index"

    timeline_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("director_timelines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    track_name: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    entry_id: Mapped[str] = mapped_column(String(128), nullable=False)
    start_frame: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    end_frame: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    entry_data: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
