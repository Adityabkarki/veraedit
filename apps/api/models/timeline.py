"""
ViraEdit — Timeline model.
Non-destructive edit graph stored as JSONB.

The timeline JSON structure:
{
  "version": 1,
  "tracks": [
    {
      "id": "track-video-1",
      "type": "video",
      "clips": [
        {
          "id": "clip-1",
          "asset_id": "uuid",
          "source_start": 0.0,
          "source_end": 120.5,
          "timeline_start": 0.0,
          "timeline_end": 118.0,
          "speed": 1.0,
          "effects": [],
          "transitions": {"in": null, "out": {"type": "fade", "duration": 0.5}}
        }
      ]
    },
    {"id": "track-audio-1", "type": "audio", "clips": [...]},
    {"id": "track-captions", "type": "captions", "clips": [...]}
  ],
  "global_settings": {
    "resolution": "1920x1080",
    "fps": 30,
    "audio_sample_rate": 48000
  }
}
"""
import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .project import Project
    from .render import Render


class Timeline(BaseModel):
    __tablename__ = "timelines"

    # Ownership
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Identity
    name: Mapped[str] = mapped_column(String(255), default="Main Timeline", nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # The edit graph — all clips, tracks, effects, transitions
    data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, default=dict)

    # Branching support — timelines can be branched from each other
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("timelines.id", ondelete="SET NULL"), nullable=True
    )

    # Only one timeline is "active" per project at a time
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="timelines")
    renders: Mapped[List["Render"]] = relationship(
        "Render", back_populates="timeline", cascade="all, delete-orphan"
    )
    parent: Mapped[Optional["Timeline"]] = relationship(
        "Timeline", remote_side="Timeline.id", back_populates="branches"
    )
    branches: Mapped[List["Timeline"]] = relationship(
        "Timeline", back_populates="parent"
    )
