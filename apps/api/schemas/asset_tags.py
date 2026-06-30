"""
ViraEdit — Asset tag schema for the reusable workspace library.

Tags are auto-generated on upload and used by template slot matching (Phase 2).
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


ShotType = Literal[
    "talking_head",
    "b_roll",
    "screen_recording",
    "product_shot",
    "text_card",
    "logo",
    "establishing_shot",
    "action",
    "interview",
    "unknown",
]

SettingType = Literal["indoor", "outdoor", "studio", "office", "unknown"]
EnergyLevel = Literal["calm", "moderate", "high_energy"]
EmotionType = Literal["neutral", "happy", "serious", "excited", "informative", "unknown"]


class AssetTags(BaseModel):
    """Machine-readable attributes for a library asset."""

    shot_type: ShotType = "unknown"
    subject_count: int = Field(default=0, ge=0)
    has_face: bool = False
    setting: SettingType = "unknown"
    energy_level: EnergyLevel = "moderate"
    emotion: EmotionType = "neutral"
    dominant_colors: list[str] = Field(default_factory=list)
    aspect_ratio: str = "16:9"
    is_landscape_orientation: bool = True
    has_text_overlay: bool = False
    has_spoken_audio: bool = False
    duration_seconds: Optional[float] = None
    description: str = ""
    tagging_confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class LibraryAssetOut(BaseModel):
    """API response for a tagged library asset."""

    id: str
    storage_key: str
    thumb_key: Optional[str] = None
    asset_type: Literal["video", "image", "logo"]
    source: Literal["uploaded", "ai_generated"] = "uploaded"
    tags: AssetTags
    thumb_url: Optional[str] = None
