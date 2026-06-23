"""
ViraEdit — Suggestion model.
AI-generated editing recommendations displayed to the user.
User can accept, reject, or modify each suggestion.

All suggestion text is in ENGLISH (UI rule), even though video content is Nepali.
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


class SuggestionType(str, enum.Enum):
    HOOK_REWRITE = "hook_rewrite"         # Rewrite the opening hook
    CUT = "cut"                           # Remove a section
    TRANSITION = "transition"             # Add/change a transition
    CAPTION = "caption"                   # Caption suggestion
    HIGHLIGHT = "highlight"               # Mark as highlight moment
    SHORT_CLIP = "short_clip"             # Extract as short
    REMOVE_FILLER = "remove_filler"       # Remove filler words
    REORDER = "reorder"                   # Reorder scenes
    AUDIO_FIX = "audio_fix"              # Audio improvement
    VISUAL_OPPORTUNITY = "visual_opportunity"  # B-roll suggestion


class SuggestionStatus(str, enum.Enum):
    PENDING = "pending"      # Awaiting user review
    ACCEPTED = "accepted"    # User accepted
    REJECTED = "rejected"    # User rejected
    APPLIED = "applied"      # Applied to timeline
    MODIFIED = "modified"    # User accepted with modifications


class Suggestion(BaseModel):
    __tablename__ = "suggestions"

    # Ownership
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    asset_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=True, index=True
    )

    # Classification
    type: Mapped[SuggestionType] = mapped_column(
        Enum(SuggestionType, name="suggestion_type_enum"), nullable=False, index=True
    )

    # Human-readable content (English UI)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Machine-readable action — interpreted by timeline engine
    # e.g. {"action": "cut", "start": 12.5, "end": 18.2, "reason": "filler content"}
    action: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # AI confidence score
    confidence: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)

    # User's decision
    status: Mapped[SuggestionStatus] = mapped_column(
        Enum(SuggestionStatus, name="suggestion_status_enum"),
        default=SuggestionStatus.PENDING,
        nullable=False,
        index=True,
    )

    # Time range this suggestion applies to (seconds)
    start_time: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    end_time: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="suggestions")
    asset: Mapped[Optional["Asset"]] = relationship("Asset", back_populates="suggestions")
