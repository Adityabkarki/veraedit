"""
ViraEdit — Asset model.
Represents an uploaded video or audio file.
Source files are NEVER modified — all edits are stored in Timeline JSON.
"""
import enum
import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import BigInteger, Enum, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .highlight import Highlight
    from .project import Project
    from .scene import Scene
    from .short import Short
    from .suggestion import Suggestion
    from .transcript import Transcript


class MediaType(str, enum.Enum):
    VIDEO = "video"
    AUDIO = "audio"


class AssetStatus(str, enum.Enum):
    UPLOADING = "uploading"
    UPLOADED = "uploaded"
    TRANSCRIBING = "transcribing"
    ANALYZING = "analyzing"
    READY = "ready"
    ERROR = "error"


class Asset(BaseModel):
    __tablename__ = "assets"

    # Ownership
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # File identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(1000), nullable=False)  # MinIO/S3 path

    # File properties
    file_size: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    media_type: Mapped[MediaType] = mapped_column(
        Enum(MediaType, name="media_type_enum"), nullable=False
    )
    mime_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Processing state
    status: Mapped[AssetStatus] = mapped_column(
        Enum(AssetStatus, name="asset_status_enum"),
        default=AssetStatus.UPLOADING,
        nullable=False,
        index=True,
    )
    error_message: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)

    # FFprobe metadata: resolution, codec, fps, audio_channels, etc.
    media_metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Celery task IDs for tracking background jobs
    celery_transcription_task_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    celery_analysis_task_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="assets")
    transcript: Mapped[Optional["Transcript"]] = relationship(
        "Transcript", back_populates="asset", uselist=False, cascade="all, delete-orphan"
    )
    scenes: Mapped[List["Scene"]] = relationship(
        "Scene", back_populates="asset", cascade="all, delete-orphan", order_by="Scene.index"
    )
    suggestions: Mapped[List["Suggestion"]] = relationship(
        "Suggestion", back_populates="asset", cascade="all, delete-orphan"
    )
    shorts: Mapped[List["Short"]] = relationship(
        "Short", back_populates="asset", cascade="all, delete-orphan"
    )
    highlights: Mapped[List["Highlight"]] = relationship(
        "Highlight", back_populates="asset", cascade="all, delete-orphan"
    )
