"""
ViraEdit — Ingestion API schemas.
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class IngestURLRequest(BaseModel):
    url: str = Field(..., min_length=8, description="Public video URL")
    project_id: str = Field(..., description="Target project UUID")


class IngestResponse(BaseModel):
    job_id: str
    status: str


class JobStatusResponse(BaseModel):
    id: str
    status: str
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None


class MediaAssetOut(BaseModel):
    id: str
    project_id: str
    storage_key: str
    thumb_key: Optional[str] = None
    duration: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    source_url: Optional[str] = None
