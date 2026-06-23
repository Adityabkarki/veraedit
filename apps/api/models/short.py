"""
ViraEdit — Short model.
Auto-detected viral clip candidates from the AI pipeline.
Displayed in Shorts Mode with platform-specific virality scores.
"""
import enum
import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Enum, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .asset import Asset
    from .project import Project
    from .render import Render


class ShortStatus(str, enum.Enum):
    DETECTED = "detected"    # Found by AI
    APPROVED = "approved"    # User marked as good
    REJECTED = "rejected"    # User dismissed
    RENDERING = "rendering"  # Export in progress
    RENDERED = "rendered"    # Export complete


class Short(BaseModel):
    __tablename__ = "shorts"

    # Ownership
    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Time range in source asset
    start_time: Mapped[float] = mapped_column(Float, nullable=False)
    end_time: Mapped[float] = mapped_column(Float, nullable=False)

    # AI analysis (English)
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    hook: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Opening hook text
    why_viral: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # AI explanation

    # Virality scores (0.0 - 10.0)
    viral_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # {"youtube": 8.2, "tiktok": 9.1, "instagram": 7.8, "facebook": 6.5}
    platform_scores: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Processing state
    status: Mapped[ShortStatus] = mapped_column(
        Enum(ShortStatus, name="short_status_enum"),
        default=ShortStatus.DETECTED,
        nullable=False,
        index=True,
    )

    # Link to render when exported
    render_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("renders.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    asset: Mapped["Asset"] = relationship("Asset", back_populates="shorts")
    project: Mapped["Project"] = relationship("Project", back_populates="shorts")
    render: Mapped[Optional["Render"]] = relationship("Render")
