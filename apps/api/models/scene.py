"""
ViraEdit — Scene model.
Represents a detected scene within an asset.
Used for timeline segmentation, topic display, and shorts extraction.
"""
import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .asset import Asset


class Scene(BaseModel):
    __tablename__ = "scenes"

    # Ownership
    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Position in video
    index: Mapped[int] = mapped_column(Integer, nullable=False)  # 0-based order
    start_time: Mapped[float] = mapped_column(Float, nullable=False)  # seconds
    end_time: Mapped[float] = mapped_column(Float, nullable=False)  # seconds

    # AI-generated scene analysis (in English, even though content is Nepali)
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    topics: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)  # ["cooking", "health"]

    # Emotional / energy analysis
    emotion: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # "excited", "calm"
    energy_level: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 0.0 - 1.0

    # Transcript excerpt for this scene (Nepali text)
    transcript_excerpt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Visual analysis notes
    visual_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Highlight scoring — used for shorts extraction
    is_highlight: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    highlight_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 0.0 - 1.0

    # Retention prediction score
    retention_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 0.0 - 1.0

    # Platform-specific viral scores
    # {"youtube": 7.2, "tiktok": 8.5, "instagram": 6.9}
    platform_scores: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # micro = editing signals (30–90s); chapter = UI topic chunks (4–15 min)
    scene_kind: Mapped[str] = mapped_column(String(20), default="chapter", nullable=False, index=True)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationship
    asset: Mapped["Asset"] = relationship("Asset", back_populates="scenes")
