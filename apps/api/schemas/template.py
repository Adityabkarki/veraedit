"""
ViraEdit — Style template schema v2.1 (Phase 01).

Every video slot carries structured requirements for Phase 2 asset matching.
v2.1 adds audio_profile, director_notes, and per-slot audio_cue.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


class SlotRequirement(BaseModel):
    """What kind of asset a template slot needs — used for matching in Phase 2."""

    shot_type: str
    energy_level: str
    min_duration: float = Field(ge=0)
    max_duration: float = Field(ge=0)
    needs_face: bool = False
    setting_hint: Optional[str] = None
    description: str


class AudioProfile(BaseModel):
    """What the reference video sounds like — used by Phase 6 render."""

    music_genre: str = "none"
    music_energy_arc: str = "none"
    has_sfx_hits: bool = False
    sfx_style: Optional[str] = None
    music_ducking_behavior: str = "no music"
    voice_emotion_arc: str = "consistently moderate"


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
    audio_cue: Optional[str] = None


class StyleTemplate(BaseModel):
    version: str = "2.1"
    source_url: Optional[str] = None
    duration: float = Field(ge=0)
    aspect_ratio: str
    color_palette: list[str] = Field(default_factory=list)
    pacing: Literal["fast", "medium", "slow"] = "medium"
    visual_style: str = "ugc"
    caption_style: dict = Field(default_factory=dict)
    audio_profile: AudioProfile = Field(default_factory=AudioProfile)
    director_notes: list[str] = Field(default_factory=list)
    slots: list[TemplateSlot] = Field(default_factory=list)
    transitions: list[dict] = Field(default_factory=list)
    music_mood: Optional[str] = None  # legacy v2.0 — migrated into audio_profile

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_music_mood(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        if data.get("audio_profile"):
            return data
        legacy_mood = data.get("music_mood")
        if not legacy_mood or str(legacy_mood).lower() == "none":
            return data
        mood = str(legacy_mood).lower()
        data = dict(data)
        data["audio_profile"] = {
            "music_genre": mood,
            "music_energy_arc": "high throughout" if mood == "upbeat" else "calm with one peak",
            "has_sfx_hits": False,
            "sfx_style": None,
            "music_ducking_behavior": "music stays constant",
            "voice_emotion_arc": "consistently moderate",
        }
        return data
