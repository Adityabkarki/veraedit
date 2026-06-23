"""
ViraEdit — Cost model.
Logs every AI API call and its cost.
Used to enforce the $2.00/hr video hard budget limit.

Cost tracking is critical — every AI call goes through ModelRouter
which checks and logs here before proceeding.
"""
import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .project import Project


class Cost(BaseModel):
    __tablename__ = "costs"

    # Ownership — costs are always tied to a project
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # What model was called
    # e.g. "elevenlabs/scribe_v2", "openai/gpt-4o-mini", "anthropic/claude-sonnet-4"
    model: Mapped[str] = mapped_column(String(200), nullable=False)

    # What the call was for
    # e.g. "transcription", "scene_analysis", "hook_rewrite", "shorts_extraction"
    task: Mapped[str] = mapped_column(String(100), nullable=False)

    # Token counts (for LLM calls)
    input_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Audio duration (for Whisper calls)
    audio_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Actual cost in USD
    cost_usd: Mapped[float] = mapped_column(Float, nullable=False)

    # Asset this cost relates to (nullable — some calls are project-level)
    asset_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assets.id", ondelete="SET NULL"), nullable=True
    )

    # Relationship
    project: Mapped["Project"] = relationship("Project", back_populates="costs")
