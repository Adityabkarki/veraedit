"""
ViraEdit — Ingestion job model.

Tracks URL download and direct-upload processing jobs.
"""
from __future__ import annotations

import enum
import uuid
from typing import Optional

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel


class JobType(str, enum.Enum):
    INGEST_URL = "INGEST_URL"
    UPLOAD_FILE = "UPLOAD_FILE"
    STYLE_CLONE = "STYLE_CLONE"
    STYLE_INTELLIGENCE = "STYLE_INTELLIGENCE"
    TRANSCRIBE = "TRANSCRIBE"
    RENDER_CAPTIONS = "RENDER_CAPTIONS"
    APPLY_CUTS = "APPLY_CUTS"
    EXTRACT_SHORTS = "EXTRACT_SHORTS"
    EXTRACT_CHAPTERS = "EXTRACT_CHAPTERS"
    GENERATE_SIZZLE = "GENERATE_SIZZLE"
    RENDER_FROM_TEMPLATE = "RENDER_FROM_TEMPLATE"


class JobStatus(str, enum.Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


class Job(BaseModel):
    __tablename__ = "jobs"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[JobType] = mapped_column(
        Enum(JobType, name="job_type_enum"),
        nullable=False,
    )
    status: Mapped[JobStatus] = mapped_column(
        Enum(
            JobStatus,
            name="job_status_enum",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        default=JobStatus.QUEUED,
        nullable=False,
        index=True,
    )
    payload: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    result: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
