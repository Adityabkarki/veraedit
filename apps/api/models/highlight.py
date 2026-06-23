"""
ViraEdit — Highlight model.
Promo-style clip candidates with per-platform aspect-ratio packs.
"""
import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .asset import Asset
    from .project import Project


class Highlight(BaseModel):
    __tablename__ = "highlights"

    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    start_time: Mapped[float] = mapped_column(Float, nullable=False)
    end_time: Mapped[float] = mapped_column(Float, nullable=False)

    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    promo_copy_en: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    promo_caption_ne: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    highlight_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # [{platform, aspect_ratio, width, height, crop, thumbnail_url}]
    platform_packs: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="detected", nullable=False)
    superseded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    asset: Mapped["Asset"] = relationship("Asset", back_populates="highlights")
    project: Mapped["Project"] = relationship("Project", back_populates="highlights")
