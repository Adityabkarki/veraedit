"""
ViraEdit — Timeline Pydantic schemas (T-2.7.2).

Validates the timeline JSON structure on every save.
The canonical timeline shape:

{
  "schema_version": 1,
  "tracks": [
    {
      "id": "track-video-1",
      "type": "video",
      "name": "Main Video",
      "muted": false,
      "locked": false,
      "visible": true,
      "clips": [
        {
          "id": "clip-abc123",
          "asset_id": "uuid-string",
          "source_start": 0.0,
          "source_end": 120.5,
          "timeline_start": 0.0,
          "timeline_end": 118.0,
          "speed": 1.0,
          "muted": false,
          "volume": 1.0,
          "effects": [],
          "transitions": {"in": null, "out": {"type": "fade", "duration": 0.5}},
          "label": ""
        }
      ]
    }
  ],
  "global_settings": {
    "resolution": "1920x1080",
    "fps": 30.0,
    "audio_sample_rate": 48000,
    "duration": 118.0
  },
  "metadata": {}
}
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# ── Enums ─────────────────────────────────────────────────────────────────────

class TrackType(str, Enum):
    VIDEO    = "video"
    AUDIO    = "audio"
    CAPTIONS = "captions"
    OVERLAY  = "overlay"
    MUSIC    = "music"
    EFFECTS  = "effects"


class TransitionType(str, Enum):
    CUT      = "cut"
    FADE     = "fade"
    DISSOLVE = "dissolve"
    WIPE     = "wipe"
    ZOOM     = "zoom"
    WHIP_PAN = "whip_pan"
    SLIDE    = "slide"


# ── Sub-models ────────────────────────────────────────────────────────────────

class TransitionModel(BaseModel):
    """A clip transition (fade, wipe, etc.)."""
    type: TransitionType = TransitionType.CUT
    duration: float = Field(default=0.5, ge=0.0, le=5.0)

    model_config = {"extra": "allow"}


class EffectModel(BaseModel):
    """An effect applied to a clip (filter, LUT, color grade, speed ramp)."""
    type: str = Field(..., min_length=1, max_length=64)
    params: dict[str, Any] = Field(default_factory=dict)

    model_config = {"extra": "allow"}


class ClipTransitions(BaseModel):
    """In/out transitions for a clip — both are optional."""
    in_: Optional[TransitionModel] = Field(None, alias="in")
    out: Optional[TransitionModel] = None

    model_config = {"extra": "allow", "populate_by_name": True}


class ClipModel(BaseModel):
    """
    A single clip on the timeline.

    source_start/source_end:   time window inside the source asset (seconds)
    timeline_start/timeline_end: position on the project timeline (seconds)
    speed: 1.0 = normal, 2.0 = 2× fast, 0.5 = slow-mo
    """
    id: str = Field(..., min_length=1, max_length=128)
    asset_id: str = Field(..., min_length=1, max_length=128)
    source_start: float = Field(..., ge=0.0)
    source_end: float = Field(..., ge=0.0)
    timeline_start: float = Field(..., ge=0.0)
    timeline_end: float = Field(..., ge=0.0)
    speed: float = Field(default=1.0, ge=0.1, le=10.0)
    muted: bool = False
    volume: float = Field(default=1.0, ge=0.0, le=4.0)
    effects: list[EffectModel] = Field(default_factory=list)
    transitions: ClipTransitions = Field(default_factory=ClipTransitions)
    label: str = Field(default="", max_length=255)

    model_config = {"extra": "allow"}

    @field_validator("source_end")
    @classmethod
    def source_end_after_start(cls, v: float, info) -> float:
        src_start = info.data.get("source_start", 0.0)
        if v <= src_start:
            raise ValueError(
                f"source_end ({v}) must be greater than source_start ({src_start})"
            )
        return v

    @field_validator("timeline_end")
    @classmethod
    def timeline_end_after_start(cls, v: float, info) -> float:
        tl_start = info.data.get("timeline_start", 0.0)
        if v <= tl_start:
            raise ValueError(
                f"timeline_end ({v}) must be greater than timeline_start ({tl_start})"
            )
        return v

    @property
    def source_duration(self) -> float:
        return self.source_end - self.source_start

    @property
    def timeline_duration(self) -> float:
        return self.timeline_end - self.timeline_start


class TrackModel(BaseModel):
    """A single track on the timeline (video, audio, captions, overlay)."""
    id: str = Field(..., min_length=1, max_length=128)
    type: TrackType
    name: str = Field(default="", max_length=255)
    muted: bool = False
    locked: bool = False
    visible: bool = True
    clips: list[ClipModel] = Field(default_factory=list)

    model_config = {"extra": "allow"}


class GlobalSettingsModel(BaseModel):
    """Project-level output settings."""
    resolution: str = Field(default="1920x1080", pattern=r"^\d+x\d+$")
    fps: float = Field(default=30.0, ge=1.0, le=120.0)
    audio_sample_rate: int = Field(default=48000, ge=8000, le=192000)
    duration: float = Field(default=0.0, ge=0.0)   # total timeline duration in seconds

    model_config = {"extra": "allow"}


class TimelineDataModel(BaseModel):
    """
    The complete timeline data payload — stored in Timeline.data JSONB.

    schema_version is used for forward-compatibility. Currently = 1.
    """
    schema_version: int = Field(default=1, ge=1)
    tracks: list[TrackModel] = Field(default_factory=list)
    global_settings: GlobalSettingsModel = Field(default_factory=GlobalSettingsModel)
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = {"extra": "allow"}

    @model_validator(mode="after")
    def check_unique_track_ids(self) -> "TimelineDataModel":
        ids = [t.id for t in self.tracks]
        if len(ids) != len(set(ids)):
            raise ValueError("All track IDs must be unique within the timeline")
        return self

    @model_validator(mode="after")
    def check_unique_clip_ids(self) -> "TimelineDataModel":
        all_clip_ids: list[str] = []
        for track in self.tracks:
            all_clip_ids.extend(c.id for c in track.clips)
        if len(all_clip_ids) != len(set(all_clip_ids)):
            raise ValueError("All clip IDs must be unique across all tracks")
        return self

    @classmethod
    def empty(cls) -> "TimelineDataModel":
        """Return a default empty timeline — used when no timeline exists yet."""
        return cls(
            schema_version=1,
            tracks=[
                TrackModel(id="track-video-1", type=TrackType.VIDEO, name="Main Video"),
                TrackModel(id="track-audio-1", type=TrackType.AUDIO, name="Main Audio"),
                TrackModel(id="track-captions", type=TrackType.CAPTIONS, name="Captions"),
            ],
            global_settings=GlobalSettingsModel(),
            metadata={},
        )


# ── Request / Response schemas ────────────────────────────────────────────────

class TimelineSaveRequest(BaseModel):
    """Body for PUT /timeline — save a new version of the timeline."""
    data: TimelineDataModel
    label: str = Field(default="", max_length=255, description="Optional version label")


class TimelineResponse(BaseModel):
    """Response shape for GET /timeline and PUT /timeline."""
    id: str
    version: int
    label: str
    data: dict[str, Any]
    parent_id: Optional[str]
    can_undo: bool
    can_redo: bool
    created_at: str
    updated_at: str


class TimelineVersionItem(BaseModel):
    """One entry in GET /timeline/versions."""
    id: str
    version: int
    label: str
    is_active: bool
    parent_id: Optional[str]
    created_at: str


class SuggestionModifyRequest(BaseModel):
    """Body for PUT /suggestions/{id} — modify a suggestion before accepting."""
    action: Optional[dict[str, Any]] = None
    title: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = None
    notes: Optional[str] = Field(
        None, max_length=2000, description="User notes about this modification"
    )
