"""
ViraEdit — Style template schema v2.0 (Phase 01).

Every video slot carries structured requirements for Phase 2 asset matching.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class SlotRequirement(BaseModel):
    """What kind of asset a template slot needs — used for matching in Phase 2."""

    shot_type: str
    energy_level: str
    min_duration: float = Field(ge=0)
    max_duration: float = Field(ge=0)
    needs_face: bool = False
    setting_hint: Optional[str] = None
    description: str


class TemplateSlot(BaseModel):
    slot_id: str
    type: Literal[
        "video_placeholder",
        "text_overlay",
        "image_placeholder",
        "logo_placeholder",
    ]
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    label: str
    requirement: Optional[SlotRequirement] = None


class StyleTemplate(BaseModel):
    version: str = "2.0"
    source_url: Optional[str] = None
    duration: float = Field(ge=0)
    aspect_ratio: str
    color_palette: list[str] = Field(default_factory=list)
    pacing: Literal["fast", "medium", "slow"] = "medium"
    visual_style: str = "ugc"
    caption_style: dict = Field(default_factory=dict)
    music_mood: Optional[str] = None
    slots: list[TemplateSlot] = Field(default_factory=list)
    transitions: list[dict] = Field(default_factory=list)
