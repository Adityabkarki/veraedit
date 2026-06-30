"""
ViraEdit — Gap resolution API schemas (Phase 02).
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class SlotMatchOut(BaseModel):
    status: Literal["matched", "partial", "missing"]
    asset_id: Optional[str] = None
    score: float = 0.0
    storage_key: Optional[str] = None


class MatchTemplateRequest(BaseModel):
    template: dict[str, Any]


class GenerateSlotRequest(BaseModel):
    slot_type: Literal["video_placeholder", "image_placeholder"]
    requirement_description: str = Field(..., min_length=3)
    aspect_ratio: str = "9:16"


class GenerateSlotResponse(BaseModel):
    asset_id: str
    storage_key: str
    url: str
    type: Literal["image", "video"]
    is_generated_standin: bool = True
    source: Literal["ai_generated"] = "ai_generated"
