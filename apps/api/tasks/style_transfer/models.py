"""
ViraEdit — Style Transfer data models (EP-2.8 / T-2.8.2).

Pure Python dataclasses — no database dependency.
Serializable to/from plain dicts for JSONB storage in Brand.style_dna.

StyleDNA contains:
  - PacingProfile     cut frequency and rhythm
  - CaptionStyleProfile  font, size, animation, position
  - ColorProfile      brightness, contrast, temperature
  - TransitionProfile primary cut type and duration
  - AudioProfile      music energy, normalization target
  - VisualProfile     overlay density and style
  - HookProfile       hook type and duration
  - BrollProfile      b-roll frequency and timing

StylePreset is a named, saved style in the user's library:
  - Wraps StyleDNA with a name and source info
  - Stored in Brand.style_dna as a list of presets
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional


# ── Sub-profiles ──────────────────────────────────────────────────────────────

@dataclass
class PacingProfile:
    """Cut frequency and rhythm extracted from a reference video."""
    avg_cut_duration_ms: float = 3000.0     # average scene length in ms
    cuts_per_minute: float = 20.0           # how many cuts per minute
    rhythm: str = "variable"               # "constant" | "variable" | "building"
    rhythm_variance: float = 0.0           # standard deviation of cut durations
    silence_tolerance_ms: float = 300.0    # acceptable pause length


@dataclass
class CaptionStyleProfile:
    """Caption visual style extracted from frame analysis."""
    font_size_vw: float = 5.0              # font size as % of video width
    position: str = "bottom"              # "top" | "center" | "bottom"
    color: str = "#FFFFFF"                 # dominant text color
    stroke: str = "#000000"               # text stroke/shadow color
    stroke_width: int = 3                 # stroke width in pixels (video coords)
    animation: str = "none"               # "pop" | "word-by-word" | "slide" | "none"
    max_words_per_line: int = 3           # word wrap limit
    case: str = "normal"                  # "uppercase" | "normal"
    highlight_color: str = "#FFD700"      # accent word color
    background_opacity: float = 0.0       # 0 = transparent, 1 = solid


@dataclass
class ColorProfile:
    """Color grade parameters — all values are deltas from neutral (0.0)."""
    brightness: float = 0.0    # range −1.0 to +1.0
    contrast: float = 0.0      # range −1.0 to +1.0
    saturation: float = 0.0    # range −1.0 to +1.0
    temperature: float = 0.0   # positive = warm, negative = cool
    shadows: float = 0.0       # shadow lift/crush
    highlights: float = 0.0    # highlight roll-off


@dataclass
class TransitionProfile:
    """Transition types and timing between clips."""
    primary_type: str = "cut"           # "cut" | "dissolve" | "zoom" | "whip_pan"
    avg_duration_ms: float = 0.0        # 0 = instant hard cut
    uses_sound_effects: bool = False    # whether transitions have audio cues


@dataclass
class AudioProfile:
    """Audio characteristics — music energy and voice processing."""
    music_energy: str = "none"                  # "none" | "low" | "medium" | "high"
    music_genre_hint: str = ""                  # "lo-fi" | "hiphop" | "cinematic" etc.
    ducking_aggressiveness: str = "moderate"    # "subtle" | "moderate" | "heavy"
    normalization_target_lufs: float = -14.0    # YouTube standard


@dataclass
class VisualProfile:
    """Frequency and style of non-caption text overlays."""
    uses_text_overlays: bool = False
    text_style: str = "minimal"     # "minimal" | "bold" | "neon" | "corporate"
    uses_arrows_circles: bool = False
    overlay_density: str = "sparse" # "sparse" | "moderate" | "dense"


@dataclass
class HookProfile:
    """Structure of the video's opening hook (first ~10 seconds)."""
    hook_type: str = "bold_claim"   # "bold_claim" | "story" | "question" | "reaction" | "tutorial"
    hook_duration_s: float = 5.0
    uses_text_hook_overlay: bool = False


@dataclass
class BrollProfile:
    """B-roll usage patterns throughout the video."""
    frequency: str = "low"                  # "low" | "medium" | "high"
    avg_broll_duration_ms: float = 3000.0
    broll_timing: str = "motivated"         # "motivated" | "random" | "rhythmic"


# ── StyleDNA ──────────────────────────────────────────────────────────────────

@dataclass
class StyleDNA:
    """
    Complete editing style extracted from a reference video.
    Contains all extractable style dimensions.
    """
    pacing: PacingProfile = field(default_factory=PacingProfile)
    captions: CaptionStyleProfile = field(default_factory=CaptionStyleProfile)
    color: ColorProfile = field(default_factory=ColorProfile)
    transitions: TransitionProfile = field(default_factory=TransitionProfile)
    audio: AudioProfile = field(default_factory=AudioProfile)
    visuals: VisualProfile = field(default_factory=VisualProfile)
    hook: HookProfile = field(default_factory=HookProfile)
    broll: BrollProfile = field(default_factory=BrollProfile)
    source_url: str = ""
    source_title: str = ""
    extracted_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Serialize to plain dict for JSONB storage."""
        import dataclasses
        return dataclasses.asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "StyleDNA":
        """Deserialize from a stored dict."""
        def _safe(profile_cls, key: str):
            raw = d.get(key, {})
            if not isinstance(raw, dict):
                return profile_cls()
            try:
                return profile_cls(**{
                    k: v for k, v in raw.items()
                    if k in profile_cls.__dataclass_fields__
                })
            except TypeError:
                return profile_cls()

        return cls(
            pacing=_safe(PacingProfile, "pacing"),
            captions=_safe(CaptionStyleProfile, "captions"),
            color=_safe(ColorProfile, "color"),
            transitions=_safe(TransitionProfile, "transitions"),
            audio=_safe(AudioProfile, "audio"),
            visuals=_safe(VisualProfile, "visuals"),
            hook=_safe(HookProfile, "hook"),
            broll=_safe(BrollProfile, "broll"),
            source_url=d.get("source_url", ""),
            source_title=d.get("source_title", ""),
            extracted_at=d.get("extracted_at", ""),
        )


# ── StylePreset ───────────────────────────────────────────────────────────────

@dataclass
class StylePreset:
    """
    A named, saved style template in the user's library.
    Stored as an item in Brand.style_dna["presets"].
    """
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = "My Style"
    source_url: str = ""
    source_title: str = ""
    dna: Optional[StyleDNA] = None
    components: list[str] = field(default_factory=list)
    is_template: bool = True
    effect_inventory: list[dict[str, Any]] = field(default_factory=list)
    missing_capabilities: list[dict[str, Any]] = field(default_factory=list)
    supported_coverage_pct: float = 0.0
    fidelity_score: float = 0.0
    edit_recipe: dict[str, Any] = field(default_factory=dict)
    forensic_report: dict[str, Any] = field(default_factory=dict)
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "source_url": self.source_url,
            "source_title": self.source_title,
            "dna": self.dna.to_dict() if self.dna else {},
            "components": self.components,
            "is_template": self.is_template,
            "effect_inventory": self.effect_inventory,
            "missing_capabilities": self.missing_capabilities,
            "supported_coverage_pct": self.supported_coverage_pct,
            "fidelity_score": self.fidelity_score,
            "edit_recipe": self.edit_recipe,
            "forensic_report": self.forensic_report,
            "created_at": self.created_at,
        }

    def to_summary_dict(self) -> dict[str, Any]:
        """Library list view — omit heavy DNA blob."""
        return {
            "id": self.id,
            "name": self.name,
            "source_url": self.source_url,
            "source_title": self.source_title,
            "components": self.components,
            "is_template": self.is_template,
            "has_dna": self.dna is not None,
            "effect_count": len(self.effect_inventory),
            "edit_event_count": len((self.edit_recipe or {}).get("events", [])),
            "reference_duration_s": (self.edit_recipe or {}).get("reference_duration_s"),
            "missing_capabilities": self.missing_capabilities,
            "supported_coverage_pct": self.supported_coverage_pct,
            "fidelity_score": self.fidelity_score,
            "created_at": self.created_at,
            "detected_effects": [
                e.get("name", e.get("id", ""))
                for e in self.effect_inventory
                if isinstance(e, dict)
            ][:12],
            "tool_ids": [
                e.get("id", "")
                for e in self.effect_inventory
                if isinstance(e, dict) and e.get("id")
            ],
            "has_vision": bool((self.edit_recipe or {}).get("vision")),
            "has_forensic_report": bool(self.forensic_report),
            "forensic_tool_count": len(self.forensic_report.get("draggable_tool_ids") or []),
            "timeline_row_count": len(self.forensic_report.get("section_2_timeline") or []),
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "StylePreset":
        dna_dict = d.get("dna", {})
        return cls(
            id=d.get("id", str(uuid.uuid4())),
            name=d.get("name", "My Style"),
            source_url=d.get("source_url", ""),
            source_title=d.get("source_title", ""),
            dna=StyleDNA.from_dict(dna_dict) if dna_dict else None,
            components=d.get("components", []),
            is_template=d.get("is_template", True),
            effect_inventory=d.get("effect_inventory", []),
            missing_capabilities=d.get("missing_capabilities", []),
            supported_coverage_pct=float(d.get("supported_coverage_pct", 0.0)),
            fidelity_score=float(d.get("fidelity_score", 0.0)),
            edit_recipe=d.get("edit_recipe") or {},
            forensic_report=d.get("forensic_report") or {},
            created_at=d.get("created_at", datetime.now(timezone.utc).isoformat()),
        )


# ── Style Library helpers ─────────────────────────────────────────────────────

def load_presets(brand_style_dna: Optional[dict]) -> list[StylePreset]:
    """Load all presets from Brand.style_dna dict."""
    if not brand_style_dna:
        return []
    raw_presets = brand_style_dna.get("presets", [])
    return [StylePreset.from_dict(p) for p in raw_presets if isinstance(p, dict)]


def save_preset(brand_style_dna: Optional[dict], preset: StylePreset) -> dict:
    """
    Add or update a preset in the Brand.style_dna dict.
    Returns the updated brand_style_dna dict.
    """
    dna = dict(brand_style_dna) if brand_style_dna else {}
    presets = dna.get("presets", [])
    # Replace existing preset with same ID, or append new
    found = False
    for i, p in enumerate(presets):
        if isinstance(p, dict) and p.get("id") == preset.id:
            presets[i] = preset.to_dict()
            found = True
            break
    if not found:
        presets.append(preset.to_dict())
    dna["presets"] = presets
    return dna


def delete_preset(brand_style_dna: Optional[dict], preset_id: str) -> tuple[dict, bool]:
    """
    Remove a preset by ID.
    Returns (updated_dict, was_found).
    """
    dna = dict(brand_style_dna) if brand_style_dna else {}
    presets = dna.get("presets", [])
    original_len = len(presets)
    presets = [p for p in presets if not (isinstance(p, dict) and p.get("id") == preset_id)]
    dna["presets"] = presets
    return dna, len(presets) < original_len
