"""
ViraEdit — Transcript model.
Stores word-level timestamps from ElevenLabs Scribe transcription.
Always in Nepali (language="ne") — this is the raw transcript from the video.

Word structure (stored in JSONB):
[
  {"word": "नमस्ते", "start": 0.0, "end": 0.5, "speaker": "SPEAKER_00", "confidence": 0.98},
  ...
]
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


class TranscriptStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    ERROR = "error"


class Transcript(BaseModel):
    __tablename__ = "transcripts"

    # Asset (1:1 — each asset has at most one transcript)
    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,  # enforces 1:1
        index=True,
    )

    # Always "ne" for Nepali — the core language rule
    language: Mapped[str] = mapped_column(String(10), default="ne", nullable=False)

    # Word-level data from Whisper
    words: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)

    # Flat full text for full-text search (Devanagari, indexed with pg_trgm)
    full_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Speaker diarization result
    # [{"id": "SPEAKER_00", "name": "Host", "color": "#FF6B6B", "talk_time_s": 1234.5}]
    speakers: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)

    # Detected filler words positions
    # [{"word": "सोचेको", "start": 12.3, "end": 12.8, "type": "filler"}]
    filler_words: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)

    # Processing metadata
    status: Mapped[TranscriptStatus] = mapped_column(
        Enum(TranscriptStatus, name="transcript_status_enum"),
        default=TranscriptStatus.PENDING,
        nullable=False,
        index=True,
    )
    model_used: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    cost_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)

    # Quality scoring from Whisper confidence (EP-5.7)
    quality_metrics: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Relationship
    asset: Mapped["Asset"] = relationship("Asset", back_populates="transcript")
