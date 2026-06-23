"""
Edit Toolbox — registry of every style-transfer element ViraEdit can detect and apply.

Any reference video you extract adds discovered tools to your brand toolbox.
Apply uses recipe events → toolbox tool IDs → timeline handlers.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class CapabilityStatus(str, Enum):
    SUPPORTED = "supported"
    PARTIAL = "partial"
    MISSING = "missing"


class ToolCategory(str, Enum):
    CAPTIONS = "captions"
    PACING = "pacing"
    SHOT = "shot"
    CAMERA = "camera"
    TRANSITIONS = "transitions"
    COLOR = "color"
    VFX = "vfx"
    MOTION = "motion"
    OVERLAYS = "overlays"
    IMAGES = "images"
    BROLL = "broll"
    AUDIO = "audio"
    LAYOUT = "layout"


@dataclass(frozen=True)
class EditToolDefinition:
    """One apply-able edit element in the toolbox."""
    id: str
    name: str
    category: ToolCategory
    recipe_kinds: frozenset[str]
    status: CapabilityStatus
    renderer: str
    description: str = ""
    dev_epic: str = ""
    min_apply_strength: float = 0.35
    # Optional param matcher: visual_type / broll_type / transition_type
    param_match: frozenset[tuple[str, str]] = field(default_factory=frozenset)

    def to_capability_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status.value,
            "renderer": self.renderer,
            "dev_epic": self.dev_epic,
            "category": self.category.value,
            "description": self.description,
        }

    def to_toolbox_dict(self, *, discovered: bool = False, preset_ids: list[str] | None = None) -> dict[str, Any]:
        d = self.to_capability_dict()
        d["discovered"] = discovered
        d["min_apply_strength"] = self.min_apply_strength
        if preset_ids:
            d["discovered_from_presets"] = preset_ids[:8]
        return d


def _t(
    id: str,
    name: str,
    category: ToolCategory,
    kinds: frozenset[str],
    status: CapabilityStatus,
    renderer: str,
    description: str = "",
    dev_epic: str = "",
    min_strength: float = 0.35,
    param_match: frozenset[tuple[str, str]] | None = None,
) -> EditToolDefinition:
    return EditToolDefinition(
        id=id,
        name=name,
        category=category,
        recipe_kinds=kinds,
        status=status,
        renderer=renderer,
        description=description,
        dev_epic=dev_epic,
        min_apply_strength=min_strength,
        param_match=param_match or frozenset(),
    )


# ── Master toolbox (extend here when adding new edit elements) ─────────────────

EDIT_TOOLBOX: dict[str, EditToolDefinition] = {
    "caption_pop": _t(
        "caption_pop", "Pop-in captions", ToolCategory.CAPTIONS,
        frozenset({"caption_style"}), CapabilityStatus.SUPPORTED, "caption_renderer",
        "Bold captions that pop on beat.",
        param_match=frozenset({("animation", "pop")}),
    ),
    "caption_word_by_word": _t(
        "caption_word_by_word", "Word-by-word captions", ToolCategory.CAPTIONS,
        frozenset({"caption_style"}), CapabilityStatus.SUPPORTED, "caption_renderer",
        "Shorts-style cadence, one phrase at a time.",
        param_match=frozenset({("animation", "word-by-word")}),
    ),
    "caption_slide": _t(
        "caption_slide", "Slide-up captions", ToolCategory.CAPTIONS,
        frozenset({"caption_style"}), CapabilityStatus.PARTIAL, "caption_renderer",
        "Captions slide into frame.",
        param_match=frozenset({("animation", "slide")}),
    ),
    "color_grade": _t(
        "color_grade", "Color grade", ToolCategory.COLOR,
        frozenset({"color_grade"}), CapabilityStatus.SUPPORTED, "color_filter",
        "Brightness, contrast, warmth from reference.",
    ),
    "hard_cut": _t(
        "hard_cut", "Hard cuts", ToolCategory.TRANSITIONS,
        frozenset({"hard_cut"}), CapabilityStatus.SUPPORTED, "timeline_ops",
        "Snappy jump cuts between lines.",
    ),
    "fade_transition": _t(
        "fade_transition", "Fade transitions", ToolCategory.TRANSITIONS,
        frozenset({"transition_fade", "transition_fade_black", "transition_fade_white"}),
        CapabilityStatus.SUPPORTED, "transition_renderer",
        param_match=frozenset({("transition_type", "fade")}),
    ),
    "dissolve_transition": _t(
        "dissolve_transition", "Dissolve transitions", ToolCategory.TRANSITIONS,
        frozenset({"transition_dissolve"}), CapabilityStatus.SUPPORTED, "transition_renderer",
        param_match=frozenset({("transition_type", "dissolve")}),
    ),
    "zoom_transition": _t(
        "zoom_transition", "Zoom transitions", ToolCategory.TRANSITIONS,
        frozenset({"transition_zoom"}), CapabilityStatus.PARTIAL, "transition_renderer",
        "EP-10.4", param_match=frozenset({("transition_type", "zoom")}),
    ),
    "whip_pan": _t(
        "whip_pan", "Whip-pan transitions", ToolCategory.TRANSITIONS,
        frozenset({"transition_whip_pan", "transition_whip"}), CapabilityStatus.PARTIAL,
        "transition_renderer", "Fast horizontal swipe between scenes.", "EP-10.4",
        param_match=frozenset({("transition_type", "whip_pan")}),
    ),
    "jump_cut_pacing": _t(
        "jump_cut_pacing", "Jump-cut pacing", ToolCategory.PACING,
        frozenset({"jump_cut_pacing"}), CapabilityStatus.SUPPORTED, "timeline_ops",
        "Split takes + tighten silences to match reference rhythm.",
        min_strength=0.5,
    ),
    "digital_zoom_punch": _t(
        "digital_zoom_punch", "Digital zoom punch", ToolCategory.CAMERA,
        frozenset({"digital_zoom"}), CapabilityStatus.SUPPORTED, "keyframed_transform",
        "Punch-in on emphasis without a second camera.",
        min_strength=0.45,
    ),
    "ken_burns": _t(
        "ken_burns", "Ken Burns zoom", ToolCategory.CAMERA,
        frozenset({"zoom"}), CapabilityStatus.SUPPORTED, "keyframed_transform",
        "Slow push across a static frame.",
        min_strength=0.5,
    ),
    "screen_broll_cutaway": _t(
        "screen_broll_cutaway", "Screen-recording B-roll", ToolCategory.BROLL,
        frozenset({"broll"}), CapabilityStatus.SUPPORTED, "overlay_track",
        "Fullscreen slot for your demo / UI recording.",
        param_match=frozenset({
            ("broll_type", "screen_recording"),
            ("visual_type", "screen_recording"),
        }),
    ),
    "broll_insert": _t(
        "broll_insert", "B-roll cutaway", ToolCategory.BROLL,
        frozenset({"broll"}), CapabilityStatus.SUPPORTED, "overlay_track",
        "Cutaway slot for supporting footage.",
    ),
    "image_photo": _t(
        "image_photo", "Photo layer", ToolCategory.IMAGES,
        frozenset({"visual_overlay", "graphic"}), CapabilityStatus.SUPPORTED, "visual_overlay",
        "Add a photo or PNG on its own timeline layer (Canva-style).",
        param_match=frozenset({("visual_type", "image_slot"), ("media_kind", "image")}),
    ),
    "image_sticker": _t(
        "image_sticker", "Sticker / emoji", ToolCategory.IMAGES,
        frozenset({"visual_overlay", "graphic"}), CapabilityStatus.SUPPORTED, "visual_overlay",
        "Small decorative image on the video.",
        param_match=frozenset({("visual_type", "image_sticker")}),
    ),
    "image_shape": _t(
        "image_shape", "Shape block", ToolCategory.IMAGES,
        frozenset({"visual_overlay", "graphic"}), CapabilityStatus.SUPPORTED, "visual_overlay",
        "Colored shape or icon block you can resize on canvas.",
        param_match=frozenset({("visual_type", "image_shape")}),
    ),
    "title_hook_banner": _t(
        "title_hook_banner", "Title hook banner", ToolCategory.OVERLAYS,
        frozenset({"hook"}), CapabilityStatus.SUPPORTED, "visual_overlay",
        "Top banner for your hook headline (not reference text).",
        param_match=frozenset({
            ("visual_type", "title_banner"),
            ("visual_type", "hook_banner"),
            ("banner_style", "black_bar_white_text"),
        }),
    ),
    "hook_text_overlay": _t(
        "hook_text_overlay", "Hook text overlay", ToolCategory.OVERLAYS,
        frozenset({"hook"}), CapabilityStatus.SUPPORTED, "visual_overlay",
        "Opening hook text on your footage.",
        param_match=frozenset({("visual_type", "hook_rewrite")}),
    ),
    "cta_overlay": _t(
        "cta_overlay", "Call to action", ToolCategory.OVERLAYS,
        frozenset({"cta"}), CapabilityStatus.SUPPORTED, "visual_overlay",
        "End-card question or CTA placeholder.",
    ),
    "text_overlay": _t(
        "text_overlay", "Text overlays", ToolCategory.OVERLAYS,
        frozenset({"graphic"}), CapabilityStatus.SUPPORTED, "visual_overlay",
        "On-screen text / callouts.",
    ),
    "lower_third": _t(
        "lower_third", "Lower-thirds", ToolCategory.OVERLAYS,
        frozenset({"lower_third"}), CapabilityStatus.SUPPORTED, "visual_overlay",
        "Name / topic lower-third slot.",
    ),
    "logo_overlay": _t(
        "logo_overlay", "Logo overlay", ToolCategory.OVERLAYS,
        frozenset({"logo"}), CapabilityStatus.SUPPORTED, "visual_overlay",
        "Corner logo — your brand asset.",
    ),
    "emoji_reaction": _t(
        "emoji_reaction", "Emoji reactions", ToolCategory.OVERLAYS,
        frozenset({"graphic"}), CapabilityStatus.SUPPORTED, "visual_overlay",
        param_match=frozenset({("visual_type", "emoji_element")}),
    ),
    "split_screen": _t(
        "split_screen", "Split screen", ToolCategory.LAYOUT,
        frozenset({"split_screen"}), CapabilityStatus.PARTIAL, "layout_transform",
        "Side-by-side layout.", "EP-10.4",
    ),
    "picture_in_picture": _t(
        "picture_in_picture", "Picture-in-picture", ToolCategory.LAYOUT,
        frozenset({"picture_in_picture"}), CapabilityStatus.PARTIAL, "layout_transform",
        "PiP layout.", "EP-10.4",
    ),
    "sfx_on_cut": _t(
        "sfx_on_cut", "SFX on cuts", ToolCategory.AUDIO,
        frozenset({"sfx"}), CapabilityStatus.SUPPORTED, "audio_sfx",
        "Whoosh / click slots on timeline cuts.",
        min_strength=0.4,
    ),
    "music_bed": _t(
        "music_bed", "Background music", ToolCategory.AUDIO,
        frozenset({"music_bed"}), CapabilityStatus.SUPPORTED, "music_track",
        "Full-span music placeholder with ducking hints.",
        min_strength=0.35,
    ),
    "speed_ramp": _t(
        "speed_ramp", "Speed ramps", ToolCategory.PACING,
        frozenset(), CapabilityStatus.PARTIAL, "clip_speed",
        "Fast-motion segments.", "EP-10.4",
    ),
    "progress_bar": _t(
        "progress_bar", "Progress bars", ToolCategory.OVERLAYS,
        frozenset(), CapabilityStatus.MISSING, "visual_overlay",
        "EP-10.4",
    ),
    "3d_text": _t(
        "3d_text", "3D text effects", ToolCategory.OVERLAYS,
        frozenset(), CapabilityStatus.MISSING, "visual_overlay",
        "EP-10.5",
    ),
    # ── Forensic / trailer-style tools (drag-and-drop palette) ───────────────
    "shot_aroll_host": _t(
        "shot_aroll_host", "A-Roll — Host MCU", ToolCategory.SHOT,
        frozenset({"shot"}), CapabilityStatus.SUPPORTED, "timeline_ops",
        "Medium close-up host talking head.",
        param_match=frozenset({("shot_type", "aroll_host")}),
    ),
    "shot_aroll_guest": _t(
        "shot_aroll_guest", "A-Roll — Guest MCU", ToolCategory.SHOT,
        frozenset({"shot"}), CapabilityStatus.SUPPORTED, "timeline_ops",
        "Medium close-up guest / subject.",
        param_match=frozenset({("shot_type", "aroll_guest")}),
    ),
    "shot_broll_news": _t(
        "shot_broll_news", "B-Roll — News archive", ToolCategory.SHOT,
        frozenset({"broll", "shot"}), CapabilityStatus.SUPPORTED, "overlay_track",
        "Vertical-cropped news reel cutaway.",
        param_match=frozenset({("shot_type", "broll_news"), ("broll_type", "news_archive")}),
    ),
    "shot_motion_graphic": _t(
        "shot_motion_graphic", "Motion graphic render", ToolCategory.SHOT,
        frozenset({"graphic", "shot"}), CapabilityStatus.PARTIAL, "visual_overlay",
        "Vector explainer / workflow graphic.",
        param_match=frozenset({("shot_type", "motion_graphic")}),
    ),
    "framing_mcu": _t(
        "framing_mcu", "MCU framing", ToolCategory.CAMERA,
        frozenset({"shot", "digital_zoom"}), CapabilityStatus.SUPPORTED, "keyframed_transform",
        "Medium close-up crop on speaker.",
        param_match=frozenset({("framing", "mcu")}),
    ),
    "framing_ecu": _t(
        "framing_ecu", "Extreme close-up", ToolCategory.CAMERA,
        frozenset({"digital_zoom", "shot"}), CapabilityStatus.SUPPORTED, "keyframed_transform",
        "120% climax crop on facial micro-expression.",
        param_match=frozenset({("framing", "ecu"), ("scale_end", "1.2")}),
    ),
    "zoom_step_108": _t(
        "zoom_step_108", "Step zoom 108%", ToolCategory.CAMERA,
        frozenset({"digital_zoom"}), CapabilityStatus.SUPPORTED, "keyframed_transform",
        "Instant 8% digital crop shift.",
        param_match=frozenset({("scale_end", "1.08")}),
    ),
    "zoom_step_115": _t(
        "zoom_step_115", "Step zoom 115%", ToolCategory.CAMERA,
        frozenset({"digital_zoom"}), CapabilityStatus.SUPPORTED, "keyframed_transform",
        "Tight 15% crop for emphasis.",
        param_match=frozenset({("scale_end", "1.15")}),
    ),
    "zoom_continuous_push": _t(
        "zoom_continuous_push", "Continuous push-in", ToolCategory.CAMERA,
        frozenset({"zoom", "digital_zoom"}), CapabilityStatus.SUPPORTED, "keyframed_transform",
        "Slow 100%→106% push during monologue.",
        param_match=frozenset({("zoom_mode", "continuous_push")}),
    ),
    "vfx_vignette": _t(
        "vfx_vignette", "Corner vignette", ToolCategory.VFX,
        frozenset({"color_grade"}), CapabilityStatus.SUPPORTED, "color_filter",
        "5% soft vignette to lock eye on center.",
        param_match=frozenset({("vfx", "vignette")}),
    ),
    "vfx_edge_blur": _t(
        "vfx_edge_blur", "Radial edge blur", ToolCategory.VFX,
        frozenset({"graphic"}), CapabilityStatus.PARTIAL, "visual_overlay",
        "Blur edges to emphasize expression.",
        param_match=frozenset({("vfx", "edge_blur")}),
    ),
    "vfx_frame_flash": _t(
        "vfx_frame_flash", "2-frame white flash", ToolCategory.VFX,
        frozenset({"transition_fade_white", "graphic"}), CapabilityStatus.SUPPORTED, "transition_renderer",
        "15% opacity palate cleanser between ideas.",
        param_match=frozenset({("vfx", "frame_flash")}),
    ),
    "vfx_camera_shake": _t(
        "vfx_camera_shake", "Impact camera shake", ToolCategory.VFX,
        frozenset({"digital_zoom"}), CapabilityStatus.SUPPORTED, "keyframed_transform",
        "4px shake on high-impact conversational beat.",
        param_match=frozenset({("vfx", "camera_shake")}),
    ),
    "motion_data_card": _t(
        "motion_data_card", "Data verification card", ToolCategory.MOTION,
        frozenset({"graphic", "lower_third"}), CapabilityStatus.SUPPORTED, "visual_overlay",
        "Slate card slides from right with metric highlight.",
        param_match=frozenset({("visual_type", "data_card")}),
    ),
    "motion_arrow_flow": _t(
        "motion_arrow_flow", "Directional arrow", ToolCategory.MOTION,
        frozenset({"graphic"}), CapabilityStatus.SUPPORTED, "visual_overlay",
        "Flat vector arrow for economic/system flow.",
        param_match=frozenset({("visual_type", "arrow_flow")}),
    ),
    "motion_conflict_box": _t(
        "motion_conflict_box", "Conflict highlight box", ToolCategory.MOTION,
        frozenset({"graphic"}), CapabilityStatus.SUPPORTED, "visual_overlay",
        "Pulsing red/green bounding box on admission/conflict.",
        param_match=frozenset({("visual_type", "conflict_box")}),
    ),
    "caption_scale_pop": _t(
        "caption_scale_pop", "Scale-pop captions", ToolCategory.CAPTIONS,
        frozenset({"caption_style"}), CapabilityStatus.SUPPORTED, "caption_renderer",
        "85%→108%→100% scale on word onset.",
        param_match=frozenset({("animation", "scale_pop")}),
    ),
    "caption_masked_overlay": _t(
        "caption_masked_overlay", "Masked text overlay", ToolCategory.CAPTIONS,
        frozenset({"graphic", "caption_style"}), CapabilityStatus.PARTIAL, "visual_overlay",
        "Text with shape mask (upper-third label).",
        param_match=frozenset({("caption_mode", "masked_overlay")}),
    ),
    "overlay_upper_third_label": _t(
        "overlay_upper_third_label", "Upper-third context label", ToolCategory.OVERLAYS,
        frozenset({"lower_third", "graphic"}), CapabilityStatus.SUPPORTED, "visual_overlay",
        "Floating contextual label e.g. project name.",
        param_match=frozenset({("visual_type", "upper_third_label")}),
    ),
    "sfx_sub_bass_thud": _t(
        "sfx_sub_bass_thud", "Sub-bass thud", ToolCategory.AUDIO,
        frozenset({"sfx"}), CapabilityStatus.SUPPORTED, "audio_sfx",
        "45–90Hz punch on emphasis words.",
        param_match=frozenset({("sfx_type", "sub_bass_thud")}),
    ),
    "sfx_whoosh_cut": _t(
        "sfx_whoosh_cut", "Whoosh on cut", ToolCategory.AUDIO,
        frozenset({"sfx"}), CapabilityStatus.SUPPORTED, "audio_sfx",
        "0.28s mid-frequency stereo sweep on angle change.",
        param_match=frozenset({("sfx_type", "whoosh")}),
    ),
    "sfx_shutter_click": _t(
        "sfx_shutter_click", "Camera shutter click", ToolCategory.AUDIO,
        frozenset({"sfx"}), CapabilityStatus.SUPPORTED, "audio_sfx",
        "Treble transient when data card appears.",
        param_match=frozenset({("sfx_type", "shutter_click")}),
    ),
    "sfx_impact_hit": _t(
        "sfx_impact_hit", "Impact hit", ToolCategory.AUDIO,
        frozenset({"sfx"}), CapabilityStatus.SUPPORTED, "audio_sfx",
        "Short punch for emphasis beats.",
        param_match=frozenset({("sfx_type", "impact_hit")}),
    ),
    "sfx_pop": _t(
        "sfx_pop", "UI pop", ToolCategory.AUDIO,
        frozenset({"sfx"}), CapabilityStatus.SUPPORTED, "audio_sfx",
        "Light pop for on-screen reveals.",
        param_match=frozenset({("sfx_type", "pop")}),
    ),
    "sfx_swipe": _t(
        "sfx_swipe", "Swipe", ToolCategory.AUDIO,
        frozenset({"sfx"}), CapabilityStatus.SUPPORTED, "audio_sfx",
        "Mobile-style swipe transition.",
        param_match=frozenset({("sfx_type", "swipe")}),
    ),
    "sfx_glitch": _t(
        "sfx_glitch", "Glitch tick", ToolCategory.AUDIO,
        frozenset({"sfx"}), CapabilityStatus.SUPPORTED, "audio_sfx",
        "Digital glitch accent.",
        param_match=frozenset({("sfx_type", "glitch")}),
    ),
    "sfx_riser": _t(
        "sfx_riser", "Short riser", ToolCategory.AUDIO,
        frozenset({"sfx"}), CapabilityStatus.SUPPORTED, "audio_sfx",
        "Build-up before a reveal.",
        param_match=frozenset({("sfx_type", "riser")}),
    ),
    "sfx_notification": _t(
        "sfx_notification", "Notification ding", ToolCategory.AUDIO,
        frozenset({"sfx"}), CapabilityStatus.SUPPORTED, "audio_sfx",
        "Alert / notification chime.",
        param_match=frozenset({("sfx_type", "notification")}),
    ),
    "broll_documentary": _t(
        "broll_documentary", "Documentary B-roll", ToolCategory.BROLL,
        frozenset({"broll"}), CapabilityStatus.SUPPORTED, "overlay_track",
        "Archival footage with color overlay for stats.",
        param_match=frozenset({("broll_type", "documentary")}),
    ),
    "retention_open_loop": _t(
        "retention_open_loop", "Open-loop ending", ToolCategory.PACING,
        frozenset({"hook"}), CapabilityStatus.SUPPORTED, "timeline_ops",
        "Abrupt cut on unresolved question — no outro.",
        param_match=frozenset({("retention", "open_loop")}),
    ),
}

# Default forensic palette unlocked when hyper-accelerated pacing is detected
FORENSIC_DEFAULT_TOOL_IDS = [
    "shot_aroll_host",
    "shot_aroll_guest",
    "shot_broll_news",
    "framing_mcu",
    "zoom_step_108",
    "zoom_step_115",
    "hard_cut",
    "sfx_whoosh_cut",
    "sfx_sub_bass_thud",
    "caption_scale_pop",
    "motion_data_card",
    "vfx_frame_flash",
    "color_grade",
    "retention_open_loop",
]

# Legacy alias for gap_analyzer / capabilities imports
EFFECT_REGISTRY = {tid: tool.to_capability_dict() for tid, tool in EDIT_TOOLBOX.items()}


def lookup_tool(tool_id: str) -> EditToolDefinition | None:
    return EDIT_TOOLBOX.get(tool_id)


def lookup_capability(tool_id: str) -> dict[str, Any] | None:
    tool = lookup_tool(tool_id)
    return tool.to_capability_dict() if tool else None


def _params_match(tool: EditToolDefinition, params: dict[str, Any]) -> bool:
    if not tool.param_match:
        return True
    for key, val in tool.param_match:
        if str(params.get(key, "")).lower() == val.lower():
            return True
    return False


def resolve_tool_ids_for_event(kind: str, params: dict[str, Any] | None = None) -> list[str]:
    """Map a recipe / vision event to toolbox tool ID(s)."""
    params = params or {}
    kind_l = kind.lower()

    # Transition kinds: transition_dissolve, transition_fade, hard_cut
    if kind_l.startswith("transition_") or kind_l == "hard_cut":
        t_type = params.get(
            "transition_type",
            kind_l.replace("transition_", "").replace("hard_cut", "cut"),
        )
        t_map = {
            "cut": "hard_cut",
            "fade": "fade_transition",
            "dissolve": "dissolve_transition",
            "zoom": "zoom_transition",
            "whip_pan": "whip_pan",
            "whip": "whip_pan",
        }
        tid = t_map.get(str(t_type).lower(), "hard_cut")
        if tid in EDIT_TOOLBOX:
            return [tid]

    candidates = [t for t in EDIT_TOOLBOX.values() if kind_l in t.recipe_kinds]
    param_matched = [t for t in candidates if t.param_match and _params_match(t, params)]
    if param_matched:
        return [t.id for t in param_matched]

    generic = [t for t in candidates if not t.param_match]
    if generic:
        return [t.id for t in generic]

    if kind_l == "caption_style":
        anim = str(params.get("animation", "pop")).lower()
        if anim == "word-by-word":
            return ["caption_word_by_word"]
        if anim == "slide":
            return ["caption_slide"]
        return ["caption_pop"]

    if kind_l == "broll":
        if params.get("broll_type") == "screen_recording" or params.get("visual_type") == "screen_recording":
            return ["screen_broll_cutaway"]
        return ["broll_insert"]

    if kind_l == "hook":
        vt = str(params.get("visual_type", "")).lower()
        if params.get("retention") == "open_loop":
            return ["retention_open_loop"]
        if vt in ("title_banner", "hook_banner"):
            return ["title_hook_banner"]
        return ["hook_text_overlay"]

    if kind_l == "shot":
        st = str(params.get("shot_type", "")).lower()
        if st in ("broll_news", "news_archive"):
            return ["shot_broll_news", "broll_insert"]
        if st == "motion_graphic":
            return ["shot_motion_graphic"]
        if st == "aroll_guest":
            return ["shot_aroll_guest"]
        return ["shot_aroll_host"]

    if kind_l == "sfx":
        sfx = str(params.get("sfx_type", "")).lower()
        if sfx == "sub_bass_thud":
            return ["sfx_sub_bass_thud"]
        if sfx == "shutter_click":
            return ["sfx_shutter_click"]
        return ["sfx_whoosh_cut", "sfx_on_cut"]

    return []


def discover_tool_ids_from_recipe(recipe: dict[str, Any] | None) -> list[str]:
    """All toolbox tools present in a saved edit recipe."""
    if not recipe:
        return []
    ids: list[str] = []
    for raw in recipe.get("events", []):
        if not isinstance(raw, dict):
            continue
        ids.extend(resolve_tool_ids_for_event(
            str(raw.get("kind", "")),
            dict(raw.get("params") or {}),
        ))
    return _dedupe(ids)


def discover_tool_ids_from_vision(vision: dict[str, Any] | None) -> list[str]:
    """Toolbox tools inferred from vision analysis blob."""
    if not vision:
        return []
    ids: list[str] = list(vision.get("effect_ids") or [])
    for raw in vision.get("detected_edits", []):
        if isinstance(raw, dict):
            ids.extend(resolve_tool_ids_for_event(
                str(raw.get("kind", "")),
                dict(raw.get("params") or {}),
            ))
    hints = vision.get("caption_hints") or {}
    if hints:
        ids.extend(resolve_tool_ids_for_event("caption_style", hints))
    return _dedupe(ids)


def discover_tool_ids_from_dna_effect_list(effect_ids: list[str] | None) -> list[str]:
    if not effect_ids:
        return []
    return _dedupe([e for e in effect_ids if e in EDIT_TOOLBOX])


def discover_all_tool_ids(
    *,
    recipe: dict[str, Any] | None = None,
    vision: dict[str, Any] | None = None,
    effect_ids: list[str] | None = None,
) -> list[str]:
    """Union of tools found in a reference extraction."""
    combined: list[str] = []
    combined.extend(discover_tool_ids_from_recipe(recipe))
    if recipe and recipe.get("vision"):
        combined.extend(discover_tool_ids_from_vision(recipe.get("vision")))
    if vision:
        combined.extend(discover_tool_ids_from_vision(vision))
    combined.extend(discover_tool_ids_from_dna_effect_list(effect_ids))
    return _dedupe(combined)


def build_effect_inventory(
    tool_ids: list[str],
) -> list[dict[str, Any]]:
    """Effect inventory rows for a preset (gap report)."""
    inventory: list[dict[str, Any]] = []
    for tid in tool_ids:
        tool = EDIT_TOOLBOX.get(tid)
        if tool:
            inventory.append(tool.to_capability_dict())
        else:
            inventory.append({
                "id": tid,
                "name": tid.replace("_", " ").title(),
                "status": CapabilityStatus.MISSING.value,
                "renderer": "unknown",
                "dev_epic": "EP-10.5",
                "category": "overlays",
            })
    return inventory


def build_gap_report_from_tools(tool_ids: list[str]) -> dict[str, Any]:
    inventory = build_effect_inventory(tool_ids)
    supported = [i for i in inventory if i["status"] == CapabilityStatus.SUPPORTED.value]
    partial = [i for i in inventory if i["status"] == CapabilityStatus.PARTIAL.value]
    missing = [i for i in inventory if i["status"] == CapabilityStatus.MISSING.value]
    total = len(inventory) or 1
    coverage = round((len(supported) + 0.5 * len(partial)) / total * 100, 1)
    return {
        "effect_inventory": inventory,
        "tool_ids": tool_ids,
        "supported_count": len(supported),
        "partial_count": len(partial),
        "missing_count": len(missing),
        "missing_capabilities": [
            {"id": m["id"], "name": m["name"], "dev_epic": m.get("dev_epic", "")}
            for m in missing + partial
        ],
        "supported_coverage_pct": coverage,
    }


def list_all_tools(
    discovered_ids: frozenset[str] | set[str] | None = None,
    preset_map: dict[str, list[str]] | None = None,
    *,
    core_always_available: bool = True,
) -> list[dict[str, Any]]:
    """
    Full catalog for UI.

    Core edit elements (supported + partial) are always available in the app.
    Extraction only adds templates that *reference* these tools — it does not
    gate access to the toolbox.
    """
    discovered_ids = discovered_ids or frozenset()
    preset_map = preset_map or {}
    tools: list[dict[str, Any]] = []
    for tool in sorted(EDIT_TOOLBOX.values(), key=lambda t: (t.category.value, t.name)):
        presets = preset_map.get(tool.id, [])
        is_missing = tool.status == CapabilityStatus.MISSING
        available = (not is_missing) if core_always_available else tool.id in discovered_ids
        entry = tool.to_toolbox_dict(
            discovered=available,
            preset_ids=presets if presets else None,
        )
        entry["available"] = available
        entry["is_core"] = tool.status == CapabilityStatus.SUPPORTED
        entry["from_template"] = tool.id in discovered_ids
        tools.append(entry)
    return tools


def _dedupe(ids: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for i in ids:
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out
