"""
ViraEdit — Render model.
Represents a completed or in-progress render job.
Output files are stored in MinIO viraedit-renders bucket.
"""
import enum
import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, Enum, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .project import Project
    from .render_segment import RenderSegmentRecord
    from .timeline import Timeline


class RenderPlatform(str, enum.Enum):
    YOUTUBE = "youtube"           # 1920x1080 or 3840x2160
    YOUTUBE_SHORTS = "youtube_shorts"  # 1080x1920
    INSTAGRAM = "instagram"       # 1080x1080 or 1080x1350
    INSTAGRAM_REELS = "instagram_reels"  # 1080x1920
    TIKTOK = "tiktok"            # 1080x1920
    FACEBOOK = "facebook"
    CUSTOM = "custom"


class RenderStatus(str, enum.Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    READY = "ready"
    ERROR = "error"
    CANCELLED = "cancelled"


class Render(BaseModel):
    __tablename__ = "renders"

    # Ownership
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    timeline_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("timelines.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Target platform determines encoding settings
    platform: Mapped[RenderPlatform] = mapped_column(
        Enum(RenderPlatform, name="render_platform_enum"),
        default=RenderPlatform.YOUTUBE,
        nullable=False,
    )

    # Output properties
    resolution: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # "1920x1080"
    storage_key: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)  # MinIO path
    file_size: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Processing state
    status: Mapped[RenderStatus] = mapped_column(
        Enum(RenderStatus, name="render_status_enum"),
        default=RenderStatus.QUEUED,
        nullable=False,
        index=True,
    )
    progress_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    celery_task_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)

    # FFmpeg render settings used
    render_settings: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="renders")
    timeline: Mapped["Timeline"] = relationship("Timeline", back_populates="renders")
    segments: Mapped[list["RenderSegmentRecord"]] = relationship(
        "RenderSegmentRecord",
        back_populates="render",
        cascade="all, delete-orphan",
    )
