"""Metadata pointer for binary audio analysis sidecars (Phase 13)."""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import Float, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel


class AudioAnalysisRecord(BaseModel):
    """Lightweight DB row — per-frame data lives in MinIO as binary blob."""

    __tablename__ = "audio_analysis_records"

    project_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_hash: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    storage_key: Mapped[str] = mapped_column(String(1000), nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    fps: Mapped[int] = mapped_column(Integer, nullable=False)
    frame_count: Mapped[int] = mapped_column(Integer, nullable=False)
    band_count: Mapped[int] = mapped_column(Integer, nullable=False)
    peak_amplitude: Mapped[float] = mapped_column(Float, nullable=False)
    storage_format: Mapped[str] = mapped_column(String(16), nullable=False, default="binary")
    meta_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
