"""
ViraEdit — Code-as-Video motion graphics service.

Component registry, motion-plan validation, timeline ↔ plan conversion,
asset preparation, and the AI Director (Magic VOX Mode) that writes
structured Motion Plan JSON for Remotion-rendered transparent overlays.
"""
from __future__ import annotations

import json
import re
from typing import Any

import structlog

from tasks.openai_llm_client import call_openai_llm

log = structlog.get_logger("viraedit.motion_graphics")

MOTION_GRAPHIC_TYPES: frozenset[str] = frozenset(
    {
        # Typography & captions
        "animated_title", "kinetic_text", "kinetic_line", "karaoke_caption", "kinetic_karaoke",
        "quote_callout", "soundbite", "accent_stroke", "arrow_callout",
        "callout_line", "doodle_scribble", "scribble_annotation", "cta_badge", "subscribe_badge", "end_card",
        # Podcast / broadcast
        "lower_third_pro", "broadcast_lower_third", "name_plate", "guest_intro",
        "chapter_marker", "voice_waveform", "eq_visualizer", "circular_waveform",
        "symmetric_audio_strip", "circular_orbit_equalizer", "active_speaker_split",
        "focus_frame", "social_frame", "vertical_clip_template",
        # Consultancy / infographics
        "stat_counter", "data_reveal", "bar_chart", "line_chart", "comparison_chart",
        "pie_chart", "funnel_chart", "strategy_funnel", "timeline_flow", "corporate_timeline",
        "authority_badge", "progress_timer", "map_pin", "icon_pop", "glass_card",
        "metric_ticker", "parallax_slide",
        # Product
        "product_highlight", "product_reveal", "feature_callout", "dynamic_feature_callout",
        "price_popup",
        "before_after", "device_mockup", "split_screen", "grid_layout",
        # Effects / transitions / backgrounds
        "particle_burst", "shape_transition", "pro_wipe", "whip_transition",
        "zoom_transition", "background_gradient", "background_shader", "texture_bg",
        "halftone", "geometric_pattern", "liquid_blob", "glitch_overlay",
        "paper_rip", "collage_frame", "hud_grid", "hud_loader",
    }
)

_HEX_COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")
_NUMBER_RE = re.compile(
    r"(?<![\w.])(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)(%|k|K|m|M|b|B)?(?![\w.])"
)
_LOCATION_RE = re.compile(
    r"\b(Kathmandu|Pokhara|Lalitpur|Bhaktapur|Nepal|India|China|USA|Europe|"
    r"Asia|Africa|London|New York|Tokyo|Delhi|Mumbai|Singapore|Dubai)\b",
    re.IGNORECASE,
)
_MAX_ELEMENTS = 30
_MAX_AI_ELEMENTS = 18
_MIN_DURATION = 0.3
# Physics Constant Manifest (skills.md) — elegant_glide as default
_DEFAULT_SPRING = {"damping": 24, "stiffness": 90, "mass": 1.0}

# Blueprint spring profiles — Physics Constant Manifest (skills.md)
SPRING_PROFILES: dict[str, dict[str, float]] = {
    "social": {"mass": 0.4, "damping": 12, "stiffness": 180},      # snappy_spring
    "corporate": {"mass": 1.0, "damping": 24, "stiffness": 90},    # elegant_glide
    "product": {"mass": 0.7, "damping": 8, "stiffness": 140},      # elastic_overshoot
    "default": dict(_DEFAULT_SPRING),
}

_FAMILY_BY_TYPE: dict[str, str] = {
    "voice_waveform": "social",
    "eq_visualizer": "corporate", "symmetric_audio_strip": "corporate",
    "circular_waveform": "corporate", "circular_orbit_equalizer": "corporate",
    "active_speaker_split": "corporate",
    "soundbite": "social", "karaoke_caption": "social", "kinetic_karaoke": "social",
    "subscribe_badge": "social", "social_frame": "social",
    "vertical_clip_template": "social", "scribble_annotation": "social",
    "doodle_scribble": "social",
    "guest_intro": "social", "name_plate": "social",
    "broadcast_lower_third": "social", "lower_third_pro": "social",
    "chapter_marker": "social", "focus_frame": "social", "cta_badge": "social",
    "bar_chart": "corporate", "line_chart": "corporate", "comparison_chart": "corporate",
    "pie_chart": "corporate", "funnel_chart": "corporate", "strategy_funnel": "corporate",
    "timeline_flow": "corporate",
    "corporate_timeline": "corporate", "data_reveal": "corporate", "stat_counter": "corporate",
    "metric_ticker": "corporate",
    "authority_badge": "corporate", "progress_timer": "corporate", "glass_card": "corporate",
    "icon_pop": "corporate", "parallax_slide": "corporate", "animated_title": "corporate",
    "accent_stroke": "corporate",
    "device_mockup": "product", "product_highlight": "product", "product_reveal": "product",
    "feature_callout": "product", "dynamic_feature_callout": "product",
    "callout_line": "product", "price_popup": "product",
    "before_after": "product", "split_screen": "product", "grid_layout": "product",
    "liquid_blob": "product",
}

# Preset layout snaps — enforce structural positions (not generic center cards)
_PRESET_LAYOUT: dict[str, dict[str, dict[str, float]]] = {
    "podcast": {
        "eq_visualizer": {"xPct": 50, "yPct": 90},
        "symmetric_audio_strip": {"xPct": 50, "yPct": 90},
        "voice_waveform": {"xPct": 50, "yPct": 90},
        "circular_waveform": {"xPct": 50, "yPct": 42},
        "circular_orbit_equalizer": {"xPct": 50, "yPct": 42},
        "active_speaker_split": {"xPct": 50, "yPct": 50},
        "broadcast_lower_third": {"xPct": 18, "yPct": 86},
        "name_plate": {"xPct": 22, "yPct": 86},
        "lower_third_pro": {"xPct": 22, "yPct": 86},
        "subscribe_badge": {"xPct": 50, "yPct": 82},
        "guest_intro": {"xPct": 50, "yPct": 40},
        "soundbite": {"xPct": 50, "yPct": 48},
        "karaoke_caption": {"xPct": 50, "yPct": 78},
        "split_screen": {"xPct": 50, "yPct": 50},
    },
    "consultancy": {
        "animated_title": {"xPct": 50, "yPct": 22},
        "glass_card": {"xPct": 72, "yPct": 28},
        "metric_ticker": {"xPct": 72, "yPct": 28},
        "line_chart": {"xPct": 50, "yPct": 52},
        "bar_chart": {"xPct": 50, "yPct": 52},
        "funnel_chart": {"xPct": 32, "yPct": 48},
        "strategy_funnel": {"xPct": 32, "yPct": 48},
        "corporate_timeline": {"xPct": 38, "yPct": 50},
        "progress_timer": {"xPct": 50, "yPct": 92},
        "authority_badge": {"xPct": 50, "yPct": 78},
        "data_reveal": {"xPct": 50, "yPct": 45},
    },
    "product": {
        "device_mockup": {"xPct": 50, "yPct": 48},
        "product_reveal": {"xPct": 50, "yPct": 45},
        "product_highlight": {"xPct": 50, "yPct": 48},
        "feature_callout": {"xPct": 68, "yPct": 36},
        "dynamic_feature_callout": {"xPct": 68, "yPct": 36},
        "callout_line": {"xPct": 62, "yPct": 48},
        "price_popup": {"xPct": 50, "yPct": 58},
        "subscribe_badge": {"xPct": 50, "yPct": 82},
    },
    "social": {
        "vertical_clip_template": {"xPct": 50, "yPct": 50},
        "social_frame": {"xPct": 50, "yPct": 50},
        "kinetic_karaoke": {"xPct": 50, "yPct": 72},
        "karaoke_caption": {"xPct": 50, "yPct": 72},
        "scribble_annotation": {"xPct": 68, "yPct": 36},
        "doodle_scribble": {"xPct": 68, "yPct": 36},
        "subscribe_badge": {"xPct": 50, "yPct": 82},
    },
}

# Step 4 — package-level forced physics (overrides per-type when preset applied)
PACKAGE_FORCED_CURVE: dict[str, dict[str, float]] = {
    "podcast": SPRING_PROFILES["corporate"],           # elegant_glide
    "consultancy": SPRING_PROFILES["corporate"],
    "social": SPRING_PROFILES["social"],                 # snappy_spring
    "product": SPRING_PROFILES["product"],               # elastic_overshoot
    "product_showcase": SPRING_PROFILES["product"],
}

# Atomic one-tap preset node templates (mirrors remotion-service presets/definitions.ts)
_ATOMIC_PRESET_NODES: dict[str, list[dict[str, Any]]] = {
    "podcast": [
        {"id": "pod-split", "type": "active_speaker_split", "startRatio": 0.0, "endRatio": 1.0,
         "position": {"xPct": 50, "yPct": 50}, "layerDepth": 12,
         "props": {"activeSpeakerId": "host"}, "animation": {"enter": "fade", "exit": "fade"}},
        {"id": "pod-orbit-eq", "type": "circular_orbit_equalizer", "startRatio": 0.05, "endRatio": 0.85,
         "position": {"xPct": 50, "yPct": 38}, "layerDepth": 52,
         "props": {"monogram": "H", "spokes": 36}, "animation": {"enter": "reveal", "exit": "fade"}},
        {"id": "pod-eq-strip", "type": "symmetric_audio_strip", "startRatio": 0.08, "endRatio": 0.9,
         "position": {"xPct": 50, "yPct": 90}, "layerDepth": 54,
         "props": {"bars": 28}, "animation": {"enter": "grow", "exit": "fade"}},
        {"id": "pod-l3", "type": "broadcast_lower_third", "startRatio": 0.1, "endRatio": 0.45,
         "position": {"xPct": 18, "yPct": 86}, "layerDepth": 82,
         "props": {"title": "Host Name", "subtitle": "Podcast Episode"},
         "animation": {"enter": "slide_left", "exit": "fade"}},
    ],
    "consultancy": [
        {"id": "con-title", "type": "animated_title", "startRatio": 0.0, "endRatio": 0.18,
         "position": {"xPct": 50, "yPct": 22}, "layerDepth": 14,
         "props": {"text": "Strategy Report", "fontSize": 56, "showAccentStroke": False},
         "animation": {"enter": "fade_up", "exit": "fade"}},
        {"id": "con-funnel", "type": "strategy_funnel", "startRatio": 0.08, "endRatio": 0.75,
         "position": {"xPct": 32, "yPct": 48}, "layerDepth": 22,
         "props": {"labels": ["Discover", "Design", "Deliver", "Scale"], "values": [100, 72, 48, 24]},
         "animation": {"enter": "draw", "exit": "fade"}},
        {"id": "con-metric", "type": "metric_ticker", "startRatio": 0.12, "endRatio": 0.7,
         "position": {"xPct": 72, "yPct": 28}, "layerDepth": 56,
         "props": {"title": "Pipeline", "value": 2480, "suffix": "k", "trend": 1},
         "animation": {"enter": "fade_up", "exit": "fade"}},
        {"id": "con-timeline", "type": "corporate_timeline", "startRatio": 0.2, "endRatio": 0.85,
         "position": {"xPct": 38, "yPct": 72}, "layerDepth": 26,
         "props": {"title": "Roadmap", "steps": ["2024", "2025", "2026"]},
         "animation": {"enter": "draw", "exit": "fade"}},
        {"id": "con-progress", "type": "progress_timer", "startRatio": 0.15, "endRatio": 0.9,
         "position": {"xPct": 50, "yPct": 92}, "layerDepth": 56,
         "props": {"label": "Q4 Progress", "progress": 0.68},
         "animation": {"enter": "fill", "exit": "fade"}},
    ],
    "social": [
        {"id": "soc-frame", "type": "vertical_clip_template", "startRatio": 0.0, "endRatio": 1.0,
         "position": {"xPct": 50, "yPct": 50}, "layerDepth": 14,
         "props": {"platform": "tiktok", "caption": "Hook that stops the scroll"},
         "animation": {"enter": "fade", "exit": "fade"}},
        {"id": "soc-karaoke", "type": "kinetic_karaoke", "startRatio": 0.05, "endRatio": 0.85,
         "position": {"xPct": 50, "yPct": 72}, "layerDepth": 60,
         "props": {"text": "Your words light up here", "accentColor": "#FFD600"},
         "animation": {"enter": "word_pop", "exit": "fade"}},
        {"id": "soc-scribble", "type": "scribble_annotation", "startRatio": 0.15, "endRatio": 0.75,
         "position": {"xPct": 68, "yPct": 36}, "layerDepth": 62,
         "props": {"variant": "circle", "label": "Look"},
         "animation": {"enter": "draw", "exit": "fade"}},
    ],
    "product_showcase": [
        {"id": "show-device", "type": "device_mockup", "startRatio": 0.05, "endRatio": 0.9,
         "position": {"xPct": 50, "yPct": 48}, "layerDepth": 18,
         "props": {"device": "phone", "title": "Your App"},
         "animation": {"enter": "spring_in", "exit": "scale_out"}},
        {"id": "show-callout", "type": "dynamic_feature_callout", "startRatio": 0.2, "endRatio": 0.8,
         "position": {"xPct": 68, "yPct": 36}, "layerDepth": 66,
         "props": {"text": "One-tap export"},
         "animation": {"enter": "draw", "exit": "fade"}},
        {"id": "show-callout-2", "type": "dynamic_feature_callout", "startRatio": 0.35, "endRatio": 0.85,
         "position": {"xPct": 32, "yPct": 58}, "layerDepth": 67,
         "props": {"text": "Real-time sync", "angle": 12},
         "animation": {"enter": "draw", "exit": "fade"}},
    ],
}

_PRESET_TO_ATOMIC: dict[str, str] = {
    "podcast": "podcast",
    "interview": "podcast",
    "consultancy": "consultancy",
    "pitch": "consultancy",
    "minimal": "consultancy",
    "social": "social",
    "social_reel": "social",
    "product": "product_showcase",
    "launch": "product_showcase",
    "demo": "product_showcase",
}


def spring_for_type(type_id: str) -> dict[str, float]:
    family = _FAMILY_BY_TYPE.get(type_id, "default")
    return dict(SPRING_PROFILES[family])


def build_atomic_preset_plan(
    preset_id: str,
    *,
    video_duration: float,
    brand_color: str = "#3B82F6",
    accent_color: str = "#FFD600",
    brand_kit: dict[str, Any] | None = None,
    width: int = 1920,
    height: int = 1080,
    fps: int = 30,
    title: str = "",
) -> dict[str, Any]:
    """
    One-tap preset: inject atomic pillar nodes into a MotionPlan.
    Never returns a raw generic video wrapper — only typed motion elements.
    """
    atomic_id = _PRESET_TO_ATOMIC.get(preset_id, preset_id)
    templates = _ATOMIC_PRESET_NODES.get(atomic_id)
    if not templates:
        raise ValueError(f"Unknown atomic preset: {preset_id}")

    dur = max(3.0, float(video_duration))
    forced = PACKAGE_FORCED_CURVE.get(atomic_id) or PACKAGE_FORCED_CURVE.get(
        _PRESET_TO_ATOMIC.get(preset_id, ""), SPRING_PROFILES["default"]
    )
    if atomic_id == "social":
        width, height = 1080, 1920
    elif atomic_id in ("podcast", "consultancy", "product_showcase"):
        width, height = 1920, 1080

    elements: list[dict[str, Any]] = []
    for tpl in templates:
        start = max(0.0, float(tpl["startRatio"]) * dur)
        end = max(start + 0.3, float(tpl["endRatio"]) * dur)
        anim_tpl = tpl.get("animation") or {}
        props = dict(tpl.get("props") or {})
        props.setdefault("brandColor", brand_color)
        props.setdefault("accentColor", accent_color)
        props["layerDepth"] = tpl.get("layerDepth", 50)
        if title and tpl["type"] == "animated_title":
            props["text"] = title[:80]
        if title and tpl["type"] == "vertical_clip_template":
            props["caption"] = title[:80]
        elements.append({
            "id": tpl["id"],
            "type": tpl["type"],
            "startSeconds": start,
            "endSeconds": end,
            "position": dict(tpl["position"]),
            "animation": {
                "enter": anim_tpl.get("enter", "fade"),
                "exit": anim_tpl.get("exit", "fade"),
                "enterDuration": anim_tpl.get("enterDuration", 0.4),
                "exitDuration": anim_tpl.get("exitDuration", 0.35),
                "spring": dict(forced),
            },
            "props": props,
        })

    package_key = atomic_id if atomic_id != "product_showcase" else "product"
    plan = {
        "version": 1,
        "fps": fps,
        "width": width,
        "height": height,
        "durationSeconds": dur,
        "preset": atomic_id,
        "elements": elements,
    }
    plan = apply_preset_layout(plan, package_key if package_key in _PRESET_LAYOUT else atomic_id)
    from services.brand_theme_service import attach_theme_to_plan

    return attach_theme_to_plan(
        plan,
        brand_kit=brand_kit,
        brand_color=brand_color,
        accent_color=accent_color,
    )


def apply_preset_layout(plan: dict[str, Any], package: str) -> dict[str, Any]:
    """Snap element positions and springs to package blueprint rules."""
    layout = _PRESET_LAYOUT.get(package) or {}
    forced_curve = PACKAGE_FORCED_CURVE.get(package)
    elements = plan.get("elements") or []
    for el in elements:
        if not isinstance(el, dict):
            continue
        type_id = str(el.get("type") or "")
        anim = el.get("animation") if isinstance(el.get("animation"), dict) else {}
        # Package forced curve wins (Step 4); else per-type family
        anim["spring"] = dict(forced_curve) if forced_curve else spring_for_type(type_id)
        el["animation"] = anim
        snap = layout.get(type_id)
        if snap:
            pos = el.get("position") if isinstance(el.get("position"), dict) else {}
            pos["xPct"] = snap["xPct"]
            pos["yPct"] = snap["yPct"]
            el["position"] = pos
    return plan

# Magic Mode presets — one-tap packages for non-editors.
# `package` maps to fallback content_type (podcast | consultancy | product | explainer).
MAGIC_PRESETS: dict[str, dict[str, Any]] = {
    "auto": {
        "label": "Auto",
        "hint": "Detects style from your transcript",
        "prompt": "Auto-detect the best motion graphics package for this video",
        "density": "balanced",
        "max_elements": 12,
        "package": "auto",
        "preferred": [],
        "one_tap": True,
    },
    "podcast": {
        "label": "Podcast",
        "hint": "Dual speakers, EQ rails, lower thirds",
        "prompt": (
            "Podcast highlight reel: active speaker split cards, circular orbit equalizer, "
            "symmetric audio strip, broadcast lower thirds, chapter markers, end card"
        ),
        "density": "balanced",
        "max_elements": 12,
        "package": "podcast",
        "atomic_preset": "podcast",
        "preferred": [
            "active_speaker_split", "circular_orbit_equalizer", "symmetric_audio_strip",
            "eq_visualizer", "broadcast_lower_third", "name_plate", "guest_intro",
            "soundbite", "chapter_marker", "end_card",
        ],
        "one_tap": True,
    },
    "interview": {
        "label": "Interview",
        "hint": "Guest intro, name plates, soundbites",
        "prompt": (
            "Interview cut: guest intro, broadcast lower thirds for host and guest, "
            "soundbites, focus frame, light waveform, end card"
        ),
        "density": "sparse",
        "max_elements": 8,
        "package": "podcast",
        "preferred": [
            "guest_intro", "broadcast_lower_third", "name_plate", "soundbite",
            "focus_frame", "voice_waveform", "end_card",
        ],
        "one_tap": True,
    },
    "social_reel": {
        "label": "Social Reel",
        "hint": "9:16 karaoke, scribbles, vertical template",
        "prompt": (
            "Vertical social reel: vertical clip template, kinetic karaoke captions, "
            "scribble annotations, subscribe badge, end card"
        ),
        "density": "balanced",
        "max_elements": 10,
        "package": "social",
        "atomic_preset": "social",
        "preferred": [
            "vertical_clip_template", "kinetic_karaoke", "karaoke_caption",
            "scribble_annotation", "doodle_scribble", "subscribe_badge", "end_card",
        ],
        "one_tap": True,
    },
    "social": {
        "label": "Social",
        "hint": "9:16 karaoke, scribbles, snappy spring",
        "prompt": (
            "Vertical social clip: vertical clip template, kinetic karaoke, "
            "scribble annotations"
        ),
        "density": "balanced",
        "max_elements": 8,
        "package": "social",
        "atomic_preset": "social",
        "preferred": [
            "vertical_clip_template", "kinetic_karaoke", "scribble_annotation", "end_card",
        ],
        "one_tap": True,
    },
    "consultancy": {
        "label": "Consultancy",
        "hint": "Self-drawing funnels, glass metrics, timelines",
        "prompt": (
            "Professional consultancy video: minimal animated titles, strategy funnel, "
            "glass metric tickers, corporate timelines, progress bars — no flashy bursts"
        ),
        "density": "balanced",
        "max_elements": 12,
        "package": "consultancy",
        "atomic_preset": "consultancy",
        "preferred": [
            "animated_title", "strategy_funnel", "metric_ticker", "glass_card",
            "corporate_timeline", "progress_timer", "data_reveal", "bar_chart",
            "broadcast_lower_third", "end_card",
        ],
        "one_tap": True,
    },
    "pitch": {
        "label": "Pitch Deck",
        "hint": "Stats, funnel, authority, CTA",
        "prompt": (
            "Investor pitch style: bold titles, authority badge, stat counters, "
            "funnel chart, data reveals, timeline, end card CTA"
        ),
        "density": "balanced",
        "max_elements": 10,
        "package": "consultancy",
        "preferred": [
            "animated_title", "authority_badge", "stat_counter", "data_reveal",
            "funnel_chart", "timeline_flow", "accent_stroke", "end_card",
        ],
        "one_tap": True,
    },
    "product": {
        "label": "Product",
        "hint": "3D device frame, tracking callouts",
        "prompt": (
            "Product showcase: 3D device mockup, dynamic feature callouts, "
            "fluid gloss overlay, end card"
        ),
        "density": "rich",
        "max_elements": 12,
        "package": "product",
        "atomic_preset": "product_showcase",
        "preferred": [
            "device_mockup", "dynamic_feature_callout", "feature_callout",
            "callout_line", "product_reveal", "end_card",
        ],
        "one_tap": True,
    },
    "launch": {
        "label": "Launch",
        "hint": "Reveal, price pop, confetti",
        "prompt": (
            "Product launch: dramatic product reveal, price popup, particle burst, "
            "kinetic lines, subscribe badge, end card"
        ),
        "density": "balanced",
        "max_elements": 8,
        "package": "product",
        "preferred": [
            "product_reveal", "kinetic_line", "price_popup", "particle_burst",
            "subscribe_badge", "cta_badge", "end_card",
        ],
        "one_tap": True,
    },
    "demo": {
        "label": "App Demo",
        "hint": "Device mockup, callouts, grid",
        "prompt": (
            "App demo: device mockup, feature callouts with callout lines, "
            "split screen, grid layout, glass cards, end card"
        ),
        "density": "balanced",
        "max_elements": 10,
        "package": "product",
        "preferred": [
            "device_mockup", "feature_callout", "callout_line", "split_screen",
            "grid_layout", "glass_card", "end_card",
        ],
        "one_tap": True,
    },
    "explainer": {
        "label": "VOX Explainer",
        "hint": "Halftone, charts, doodles",
        "prompt": (
            "VOX-style explainer with halftone, collage frames, bold titles, "
            "infographics, map pins, doodle scribbles, and end card"
        ),
        "density": "rich",
        "max_elements": 12,
        "package": "explainer",
        "preferred": [
            "animated_title", "halftone", "collage_frame", "accent_stroke",
            "doodle_scribble", "bar_chart", "pie_chart", "map_pin", "kinetic_text",
            "end_card",
        ],
        "one_tap": True,
    },
    "minimal": {
        "label": "Minimal",
        "hint": "Clean titles and end card only",
        "prompt": "Minimal professional overlays: one title, one lower third, end card",
        "density": "sparse",
        "max_elements": 5,
        "package": "consultancy",
        "preferred": [
            "animated_title", "broadcast_lower_third", "accent_stroke", "end_card",
        ],
        "one_tap": True,
    },
}

_MIN_ELEMENTS_BY_DENSITY = {"sparse": 3, "balanced": 5, "rich": 6}

COMPONENT_REGISTRY: dict[str, dict[str, Any]] = {
    "animated_title": {
        "label": "Animated Title",
        "category": "titles",
        "description": "Hero title card with word-by-word entrance",
        "animations": {
            "enter": ["word_pop", "slide_up", "blur_in", "scale_bounce"],
            "exit": ["fade", "slide_down"],
        },
        "defaults": {
            "text": "Your title here",
            "fontSize": 72,
            "color": "#FFFFFF",
            "accentColor": "#FFD600",
            "strokeColor": "#000000",
            "showAccentStroke": True,
            "textColor": "#FFFFFF",
        },
        "props": ["text", "fontSize", "color", "accentColor", "strokeColor", "showAccentStroke", "textColor", "textColor", "textColor", "textColor", "textColor", "textColor", "textColor", "textColor", "textColor", "textColor", "textColor", "textColor", "textColor", "textColor", "textColor", "textColor", "textColor", "textColor", "textColor"],
    },
    "kinetic_text": {
        "label": "Kinetic Text",
        "category": "typography",
        "description": "Words appear sequentially with scale and rotation",
        "animations": {
            "enter": ["pop", "rotate_in"],
            "exit": ["fade"],
        },
        "defaults": {
            "text": "Make every word count",
            "color": "#FFFFFF",
            "accentColor": "#FF6B00",
            "fontSize": 76,
        },
        "props": ["text", "color", "accentColor", "fontSize"],
    },
    "lower_third_pro": {
        "label": "Lower Third",
        "category": "lower_thirds",
        "description": "Name + role bar with slide or glass variant",
        "animations": {
            "enter": ["slide_left", "fade"],
            "exit": ["fade", "slide_left"],
        },
        "defaults": {
            "title": "Speaker Name",
            "subtitle": "Role or topic",
            "brandColor": "#3B82F6",
            "variant": "slide",
            "textColor": "#FFFFFF",
        },
        "props": ["title", "subtitle", "brandColor", "variant", "textColor"],
    },
    "stat_counter": {
        "label": "Stat Counter",
        "category": "data",
        "description": "Animated count-up number with label",
        "animations": {
            "enter": ["count_up"],
            "exit": ["fade"],
        },
        "defaults": {
            "value": 1000,
            "prefix": "",
            "suffix": "",
            "label": "Metric",
            "brandColor": "#3B82F6",
            "textColor": "#FFFFFF",
        },
        "props": ["value", "prefix", "suffix", "label", "brandColor", "textColor"],
    },
    "quote_callout": {
        "label": "Quote Callout",
        "category": "typography",
        "description": "Quote with animated quotation marks",
        "animations": {
            "enter": ["fade_up"],
            "exit": ["fade"],
        },
        "defaults": {
            "text": "A memorable quote from the video",
            "author": "",
            "brandColor": "#3B82F6",
            "textColor": "#FFFFFF",
        },
        "props": ["text", "author", "brandColor", "textColor"],
    },
    "cta_badge": {
        "label": "CTA Badge",
        "category": "cta",
        "description": "Pulsing pill call-to-action",
        "animations": {
            "enter": ["pop_pulse"],
            "exit": ["fade"],
        },
        "defaults": {
            "text": "Subscribe",
            "brandColor": "#EF4444",
            "textColor": "#FFFFFF",
        },
        "props": ["text", "brandColor", "textColor"],
    },
    "progress_timer": {
        "label": "Progress Timer",
        "category": "data",
        "description": "Animated progress bar for chapters or countdowns",
        "animations": {
            "enter": ["fill"],
            "exit": ["fade"],
        },
        "defaults": {
            "label": "Chapter 1",
            "brandColor": "#3B82F6",
            "textColor": "#FFFFFF",
            "direction": "ltr",
            "progress": 1.0,
        },
        "props": ["label", "brandColor", "textColor", "direction", "progress"],
    },
    "particle_burst": {
        "label": "Particle Burst",
        "category": "effects",
        "description": "Confetti or sparkle burst (deterministic seed)",
        "animations": {
            "enter": ["burst"],
            "exit": ["fade"],
        },
        "defaults": {
            "particleCount": 40,
            "colors": ["#FFD600", "#FF6B00", "#3B82F6", "#FFFFFF"],
            "seed": 42,
            "burstStyle": "confetti",
        },
        "props": ["particleCount", "colors", "seed", "burstStyle"],
    },
    "shape_transition": {
        "label": "Shape Transition",
        "category": "transitions",
        "description": "Full-frame wipe, circle, slide, or split transition",
        "animations": {
            "enter": ["wipe"],
            "exit": ["wipe"],
        },
        "defaults": {
            "style": "wipe",
            "color": "#000000",
        },
        "props": ["style", "color"],
    },
    "background_gradient": {
        "label": "Background Gradient",
        "category": "effects",
        "description": "Animated gradient with floating shapes",
        "animations": {
            "enter": ["fade"],
            "exit": ["fade"],
        },
        "defaults": {
            "colorA": "#1E3A5F",
            "colorB": "#3B82F6",
            "shapeCount": 6,
            "seed": 7,
        },
        "props": ["colorA", "colorB", "shapeCount", "seed"],
    },
    "arrow_callout": {
        "label": "Arrow Callout",
        "category": "callouts",
        "description": "Animated arrow with label",
        "animations": {
            "enter": ["draw"],
            "exit": ["fade"],
        },
        "defaults": {
            "text": "Look here",
            "angle": 0,
            "brandColor": "#FFD600",
        },
        "props": ["text", "angle", "brandColor"],
    },
    "end_card": {
        "label": "End Card",
        "category": "cta",
        "description": "End screen with title, subtitle, and handle",
        "animations": {
            "enter": ["rise"],
            "exit": ["fade"],
        },
        "defaults": {
            "title": "Thanks for watching",
            "subtitle": "Like & subscribe",
            "handle": "@yourchannel",
            "brandColor": "#3B82F6",
            "textColor": "#FFFFFF",
        },
        "props": ["title", "subtitle", "handle", "brandColor", "textColor"],
    },
    "bar_chart": {
        "label": "Bar Chart",
        "category": "data",
        "description": "Animated bar chart for comparisons (VOX-style data viz)",
        "animations": {
            "enter": ["grow", "spring_in"],
            "exit": ["fade"],
        },
        "defaults": {
            "title": "Key metrics",
            "labels": ["A", "B", "C"],
            "values": [40, 70, 55],
            "brandColor": "#3B82F6",
            "accentColor": "#FFD600",
            "unit": "",
        },
        "props": ["title", "labels", "values", "brandColor", "accentColor", "unit"],
    },
    "line_chart": {
        "label": "Line Chart",
        "category": "data",
        "description": "Animated line chart for trends over time",
        "animations": {
            "enter": ["draw", "spring_in"],
            "exit": ["fade"],
        },
        "defaults": {
            "title": "Trend",
            "labels": ["Q1", "Q2", "Q3", "Q4"],
            "values": [20, 45, 38, 72],
            "brandColor": "#3B82F6",
            "accentColor": "#22D3EE",
            "unit": "",
        },
        "props": ["title", "labels", "values", "brandColor", "accentColor", "unit"],
    },
    "map_pin": {
        "label": "Map Pin",
        "category": "data",
        "description": "Stylized map with animated location pin (VOX-style)",
        "animations": {
            "enter": ["drop", "spring_in"],
            "exit": ["fade"],
        },
        "defaults": {
            "label": "Kathmandu",
            "sublabel": "Nepal",
            "brandColor": "#EF4444",
            "accentColor": "#FFD600",
            "region": "asia",
            "textColor": "#FFFFFF",
        },
        "props": ["label", "sublabel", "brandColor", "accentColor", "region", "textColor"],
    },
    "background_shader": {
        "label": "Background Shader",
        "category": "effects",
        "description": "Animated mesh-gradient shader backdrop",
        "animations": {
            "enter": ["fade"],
            "exit": ["fade"],
        },
        "defaults": {
            "colorA": "#0F172A",
            "colorB": "#1E3A5F",
            "colorC": "#3B82F6",
            "intensity": 0.6,
            "seed": 11,
        },
        "props": ["colorA", "colorB", "colorC", "intensity", "seed"],
    },
    "comparison_chart": {
        "label": "Comparison Chart",
        "category": "data",
        "description": "Horizontal comparison bars (VOX-style)",
        "animations": {
            "enter": ["grow", "spring_in"],
            "exit": ["fade"],
        },
        "defaults": {
            "title": "Compared",
            "labels": ["Option A", "Option B"],
            "values": [65, 35],
            "brandColor": "#3B82F6",
            "accentColor": "#FFD600",
            "unit": "%",
            "textColor": "#FFFFFF",
        },
        "props": ["title", "labels", "values", "brandColor", "accentColor", "unit", "textColor"],
    },
    "halftone": {
        "label": "Halftone",
        "category": "effects",
        "description": "Print-style dot screen overlay (VOX signature)",
        "animations": {
            "enter": ["reveal", "fade"],
            "exit": ["fade"],
        },
        "defaults": {
            "color": "#FFD600",
            "density": 18,
            "intensity": 0.35,
            "seed": 3,
        },
        "props": ["color", "density", "intensity", "seed"],
    },
    "accent_stroke": {
        "label": "Accent Stroke",
        "category": "callouts",
        "description": "Animated underline, slash, or bracket accent",
        "animations": {
            "enter": ["stroke_draw", "spring_in"],
            "exit": ["fade"],
        },
        "defaults": {
            "label": "Key point",
            "brandColor": "#FFD600",
            "variant": "underline",
            "textColor": "#FFFFFF",
        },
        "props": ["label", "text", "brandColor", "variant", "textColor"],
    },
    # ── Podcast ──────────────────────────────────────────────────────────
    "name_plate": {
        "label": "Name Plate",
        "category": "podcast",
        "description": "Guest name plate with role and brand accent",
        "animations": {"enter": ["slide_left", "spring_in"], "exit": ["fade"]},
        "defaults": {
            "title": "Guest Name",
            "subtitle": "Title / Company",
            "brandColor": "#3B82F6",
            "accentColor": "#FFD600",
        },
        "props": ["title", "subtitle", "brandColor", "accentColor"],
    },
    "guest_intro": {
        "label": "Guest Intro",
        "category": "podcast",
        "description": "Full guest introduction card with spring entrance",
        "animations": {"enter": ["rise", "spring_in"], "exit": ["fade"]},
        "defaults": {
            "title": "Today's Guest",
            "subtitle": "Expert & Founder",
            "label": "EPISODE GUEST",
            "brandColor": "#3B82F6",
            "accentColor": "#FFD600",
            "textColor": "#FFFFFF",
        },
        "props": ["title", "subtitle", "label", "brandColor", "accentColor", "textColor"],
    },
    "chapter_marker": {
        "label": "Chapter Marker",
        "category": "podcast",
        "description": "Chapter title with smooth transition bar",
        "animations": {"enter": ["slide_up", "fade"], "exit": ["fade"]},
        "defaults": {
            "title": "Chapter 1",
            "subtitle": "Getting started",
            "brandColor": "#3B82F6",
            "accentColor": "#FFD600",
            "textColor": "#FFFFFF",
        },
        "props": ["title", "subtitle", "brandColor", "accentColor", "textColor"],
    },
    "voice_waveform": {
        "label": "Voice Waveform",
        "category": "podcast",
        "description": "Animated voice waveform visualizer",
        "animations": {"enter": ["grow", "fade"], "exit": ["fade"]},
        "defaults": {
            "brandColor": "#3B82F6",
            "accentColor": "#22D3EE",
            "bars": 24,
            "seed": 9,
        },
        "props": ["brandColor", "accentColor", "bars", "seed"],
    },
    "focus_frame": {
        "label": "Focus Frame",
        "category": "podcast",
        "description": "Talking-head focus frame with vignette and corner brackets",
        "animations": {"enter": ["fade", "reveal"], "exit": ["fade"]},
        "defaults": {
            "brandColor": "#FFFFFF",
            "intensity": 0.45,
        },
        "props": ["brandColor", "intensity"],
    },
    "soundbite": {
        "label": "Soundbite",
        "category": "podcast",
        "description": "Pull-quote soundbite with waveform accent",
        "animations": {"enter": ["fade_up", "spring_in"], "exit": ["fade"]},
        "defaults": {
            "text": "The moment that changed everything",
            "label": "SOUNDBITE",
            "brandColor": "#FFD600",
            "accentColor": "#FFFFFF",
        },
        "props": ["text", "label", "brandColor", "accentColor"],
    },
    # ── Consultancy ──────────────────────────────────────────────────────
    "data_reveal": {
        "label": "Data Reveal",
        "category": "consultancy",
        "description": "Animated data card reveal with label and value",
        "animations": {"enter": ["reveal", "spring_in"], "exit": ["fade"]},
        "defaults": {
            "title": "Insight",
            "value": 87,
            "suffix": "%",
            "label": "Client satisfaction",
            "brandColor": "#3B82F6",
            "accentColor": "#FFD600",
        },
        "props": ["title", "value", "prefix", "suffix", "label", "brandColor", "accentColor"],
    },
    "timeline_flow": {
        "label": "Timeline Flow",
        "category": "consultancy",
        "description": "Process flow / timeline steps",
        "animations": {"enter": ["grow", "spring_in"], "exit": ["fade"]},
        "defaults": {
            "title": "Our process",
            "steps": ["Discover", "Design", "Deliver", "Scale"],
            "brandColor": "#3B82F6",
            "accentColor": "#FFD600",
            "textColor": "#FFFFFF",
        },
        "props": ["title", "steps", "brandColor", "accentColor", "textColor"],
    },
    "authority_badge": {
        "label": "Authority Badge",
        "category": "consultancy",
        "description": "Trust / authority badge with brand accent",
        "animations": {"enter": ["pop", "spring_in"], "exit": ["fade"]},
        "defaults": {
            "title": "Trusted by 500+",
            "subtitle": "Enterprise clients",
            "brandColor": "#3B82F6",
            "accentColor": "#FFD600",
        },
        "props": ["title", "subtitle", "brandColor", "accentColor"],
    },
    "pro_wipe": {
        "label": "Pro Wipe",
        "category": "transitions",
        "description": "Clean professional wipe with accent edge",
        "animations": {"enter": ["wipe"], "exit": ["wipe"]},
        "defaults": {
            "color": "#0F172A",
            "accentColor": "#3B82F6",
            "style": "wipe",
        },
        "props": ["color", "accentColor", "style"],
    },
    # ── Product ──────────────────────────────────────────────────────────
    "product_highlight": {
        "label": "Product Highlight",
        "category": "product",
        "description": "Product highlight box with shine sweep",
        "animations": {"enter": ["spring_in", "fade"], "exit": ["fade"]},
        "defaults": {
            "title": "New Product",
            "subtitle": "Built for creators",
            "brandColor": "#3B82F6",
            "accentColor": "#FFFFFF",
        },
        "props": ["title", "subtitle", "brandColor", "accentColor"],
    },
    "product_reveal": {
        "label": "Product Reveal",
        "category": "product",
        "description": "Dramatic product reveal with scale and glow",
        "animations": {"enter": ["reveal", "scale_bounce"], "exit": ["fade"]},
        "defaults": {
            "title": "Introducing",
            "subtitle": "The future is here",
            "brandColor": "#8B5CF6",
            "accentColor": "#FFD600",
        },
        "props": ["title", "subtitle", "brandColor", "accentColor"],
    },
    "feature_callout": {
        "label": "Feature Callout",
        "category": "product",
        "description": "Feature / benefit callout card",
        "animations": {"enter": ["slide_left", "spring_in"], "exit": ["fade"]},
        "defaults": {
            "title": "Fast setup",
            "subtitle": "Go live in minutes",
            "label": "01",
            "brandColor": "#3B82F6",
            "accentColor": "#FFD600",
        },
        "props": ["title", "subtitle", "label", "brandColor", "accentColor"],
    },
    "price_popup": {
        "label": "Price Popup",
        "category": "product",
        "description": "Price or offer popup with spring pop",
        "animations": {"enter": ["pop_pulse", "spring_in"], "exit": ["fade"]},
        "defaults": {
            "title": "$49",
            "subtitle": "Limited offer",
            "label": "SAVE 40%",
            "brandColor": "#EF4444",
            "accentColor": "#FFD600",
        },
        "props": ["title", "subtitle", "label", "brandColor", "accentColor"],
    },
    "before_after": {
        "label": "Before / After",
        "category": "product",
        "description": "Animated before-after comparison slider",
        "animations": {"enter": ["draw", "reveal"], "exit": ["fade"]},
        "defaults": {
            "beforeLabel": "Before",
            "afterLabel": "After",
            "brandColor": "#3B82F6",
            "accentColor": "#22C55E",
        },
        "props": ["beforeLabel", "afterLabel", "brandColor", "accentColor"],
    },
    "texture_bg": {
        "label": "Texture BG",
        "category": "effects",
        "description": "Subtle animated texture / noise backdrop",
        "animations": {"enter": ["fade"], "exit": ["fade"]},
        "defaults": {
            "colorA": "#0F172A",
            "colorB": "#1E293B",
            "intensity": 0.4,
            "seed": 5,
        },
        "props": ["colorA", "colorB", "intensity", "seed"],
    },
    # ── Pro packs (audio, social, devices, infographics, FX) ─────────────
    "eq_visualizer": {
        "label": "EQ Visualizer",
        "category": "audio",
        "description": "Reactive equalizer bars",
        "animations": {"enter": ["grow", "fade"], "exit": ["fade"]},
        "defaults": {"brandColor": "#3B82F6", "accentColor": "#22D3EE", "bars": 20, "seed": 4},
        "props": ["brandColor", "accentColor", "bars", "seed"],
    },
    "circular_waveform": {
        "label": "Circular Waveform",
        "category": "audio",
        "description": "Circular audio ring visualizer",
        "animations": {"enter": ["reveal", "fade"], "exit": ["fade"]},
        "defaults": {"brandColor": "#3B82F6", "accentColor": "#FFD600"},
        "props": ["brandColor", "accentColor"],
    },
    "symmetric_audio_strip": {
        "label": "Symmetric Audio Strip",
        "category": "audio",
        "description": "Center-out reactive EQ bars (podcast lower third)",
        "animations": {"enter": ["grow", "fade"], "exit": ["fade"]},
        "defaults": {"brandColor": "#22D3EE", "accentColor": "#A78BFA", "bars": 28, "seed": 4},
        "props": ["brandColor", "accentColor", "bars", "seed", "amplitudes"],
    },
    "circular_orbit_equalizer": {
        "label": "Circular Orbit Equalizer",
        "category": "audio",
        "description": "Radial EQ bars around speaker profile mask",
        "animations": {"enter": ["reveal", "fade"], "exit": ["fade"]},
        "defaults": {"brandColor": "#22D3EE", "accentColor": "#F472B6", "spokes": 36, "monogram": "H", "seed": 7},
        "props": ["brandColor", "accentColor", "spokes", "monogram", "seed", "profileSrc", "sizePct"],
    },
    "active_speaker_split": {
        "label": "Active Speaker Split",
        "category": "podcast",
        "description": "Dual-speaker split cards with active highlight",
        "animations": {"enter": ["fade", "spring_in"], "exit": ["fade"]},
        "defaults": {"activeSpeakerId": "host", "speakers": []},
        "props": ["activeSpeakerId", "speakers", "brandColor", "accentColor"],
    },
    "strategy_funnel": {
        "label": "Strategy Funnel",
        "category": "consultancy",
        "description": "Self-drawing trapezoid strategy funnel",
        "animations": {"enter": ["draw", "fade"], "exit": ["fade"]},
        "defaults": {"labels": ["Awareness", "Interest", "Convert"], "values": [100, 60, 30], "brandColor": "#475569", "accentColor": "#10B981"},
        "props": ["labels", "values", "brandColor", "accentColor"],
    },
    "metric_ticker": {
        "label": "Metric Ticker",
        "category": "consultancy",
        "description": "Glassmorphic count-up metric with trend arrow",
        "animations": {"enter": ["fade_up", "count_up"], "exit": ["fade"]},
        "defaults": {"title": "Revenue", "value": 1000, "prefix": "", "suffix": "", "trend": 1, "brandColor": "#10B981"},
        "props": ["title", "value", "prefix", "suffix", "trend", "brandColor"],
    },
    "kinetic_karaoke": {
        "label": "Kinetic Karaoke",
        "category": "social",
        "description": "Word-by-word karaoke with snappy spring pop",
        "animations": {"enter": ["word_pop", "fade"], "exit": ["fade"]},
        "defaults": {"text": "Your words light up here", "color": "#FFFFFF", "accentColor": "#FFD600", "fontSize": 42},
        "props": ["text", "color", "accentColor", "fontSize", "words"],
    },
    "scribble_annotation": {
        "label": "Scribble Annotation",
        "category": "social",
        "description": "Self-tracing scribble arrow/circle/bracket",
        "animations": {"enter": ["draw"], "exit": ["fade"]},
        "defaults": {"variant": "arrow", "label": "", "brandColor": "#FFD600"},
        "props": ["variant", "label", "brandColor", "text"],
    },
    "vertical_clip_template": {
        "label": "Vertical Clip Template",
        "category": "social",
        "description": "9:16 safe-zone caption layout preset",
        "animations": {"enter": ["fade"], "exit": ["fade"]},
        "defaults": {
            "platform": "tiktok",
            "caption": "Hook line",
            "brandColor": "#FFFFFF",
            "accentColor": "#FFD600",
        },
        "props": ["platform", "caption", "brandColor", "accentColor", "showSafeGuides"],
    },
    "dynamic_feature_callout": {
        "label": "Dynamic Feature Callout",
        "category": "product",
        "description": "Blinking anchor dot + expanding pointer + card",
        "animations": {"enter": ["draw", "spring_in"], "exit": ["fade", "scale_out"]},
        "defaults": {"text": "Key feature", "brandColor": "#FBBF24", "angle": -18},
        "props": ["text", "brandColor", "angle", "lineLengthPct"],
    },
    "social_frame": {
        "label": "Social Frame",
        "category": "social",
        "description": "9:16 social safe-frame with platform label",
        "animations": {"enter": ["fade"], "exit": ["fade"]},
        "defaults": {"platform": "tiktok", "label": "TIKTOK", "brandColor": "#FFFFFF"},
        "props": ["platform", "label", "brandColor"],
    },
    "broadcast_lower_third": {
        "label": "Broadcast Lower Third",
        "category": "lower_thirds",
        "description": "Clean broadcast nameplate for hosts/guests",
        "animations": {"enter": ["slide_left", "spring_in"], "exit": ["fade"]},
        "defaults": {"title": "Host Name", "subtitle": "Show title", "brandColor": "#E11D48", "textColor": "#FFFFFF"},
        "props": ["title", "subtitle", "brandColor", "textColor"],
    },
    "subscribe_badge": {
        "label": "Subscribe Badge",
        "category": "cta",
        "description": "Animated subscribe / follow badge",
        "animations": {"enter": ["pop_pulse", "spring_in"], "exit": ["fade"]},
        "defaults": {"text": "Subscribe", "platform": "youtube", "brandColor": "#FF0000"},
        "props": ["text", "platform", "brandColor"],
    },
    "device_mockup": {
        "label": "Device Mockup",
        "category": "product",
        "description": "Phone, tablet, or laptop frame mockup",
        "animations": {"enter": ["spring_in", "fade"], "exit": ["fade"]},
        "defaults": {"device": "phone", "title": "App", "brandColor": "#3B82F6", "accentColor": "#FFFFFF"},
        "props": ["device", "title", "brandColor", "accentColor"],
    },
    "kinetic_line": {
        "label": "Kinetic Lines",
        "category": "typography",
        "description": "Line-by-line kinetic typography",
        "animations": {"enter": ["slide_up", "spring_in"], "exit": ["fade"]},
        "defaults": {"text": "Bold features | Fast benefits | Clear value", "color": "#FFFFFF", "accentColor": "#FFD600", "fontSize": 48, "textColor": "#FFFFFF"},
        "props": ["text", "color", "accentColor", "fontSize", "textColor"],
    },
    "glass_card": {
        "label": "Glass Card",
        "category": "ui",
        "description": "Frosted glassmorphism card",
        "animations": {"enter": ["fade_up", "spring_in"], "exit": ["fade"]},
        "defaults": {"title": "Insight", "subtitle": "Premium detail", "brandColor": "#3B82F6"},
        "props": ["title", "subtitle", "brandColor"],
    },
    "liquid_blob": {
        "label": "Liquid Blob",
        "category": "effects",
        "description": "Organic morphing liquid blob",
        "animations": {"enter": ["reveal", "fade"], "exit": ["fade"]},
        "defaults": {"colorA": "#8B5CF6", "colorB": "#3B82F6"},
        "props": ["colorA", "colorB"],
    },
    "callout_line": {
        "label": "Call-Out Line",
        "category": "callouts",
        "description": "Animated line pointing to a feature",
        "animations": {"enter": ["draw", "spring_in"], "exit": ["fade"]},
        "defaults": {"text": "Tap here", "angle": -25, "brandColor": "#FFD600"},
        "props": ["text", "angle", "brandColor"],
    },
    "pie_chart": {
        "label": "Pie Chart",
        "category": "data",
        "description": "Animated pie / donut chart",
        "animations": {"enter": ["grow", "spring_in"], "exit": ["fade"]},
        "defaults": {"title": "Share", "labels": ["A", "B", "C"], "values": [40, 35, 25], "brandColor": "#3B82F6", "accentColor": "#FFD600", "textColor": "#FFFFFF"},
        "props": ["title", "labels", "values", "brandColor", "accentColor", "textColor"],
    },
    "funnel_chart": {
        "label": "Funnel Chart",
        "category": "data",
        "description": "Funnel infographic stages",
        "animations": {"enter": ["grow", "spring_in"], "exit": ["fade"]},
        "defaults": {"labels": ["Awareness", "Interest", "Convert"], "values": [100, 60, 30], "brandColor": "#3B82F6", "accentColor": "#FFD600"},
        "props": ["labels", "values", "steps", "brandColor", "accentColor"],
    },
    "corporate_timeline": {
        "label": "Corporate Timeline",
        "category": "consultancy",
        "description": "Vertical history / roadmap timeline",
        "animations": {"enter": ["grow", "spring_in"], "exit": ["fade"]},
        "defaults": {"title": "Roadmap", "steps": ["2022", "2023", "2024", "2025"], "brandColor": "#3B82F6", "accentColor": "#FFD600"},
        "props": ["title", "steps", "brandColor", "accentColor"],
    },
    "parallax_slide": {
        "label": "Parallax Slide",
        "category": "ui",
        "description": "Minimalist parallax text slide",
        "animations": {"enter": ["fade_up", "fade"], "exit": ["fade"]},
        "defaults": {"title": "Elegant", "subtitle": "Minimal movement", "brandColor": "#FFFFFF", "textColor": "#FFFFFF"},
        "props": ["title", "subtitle", "text", "brandColor", "textColor"],
    },
    "icon_pop": {
        "label": "Icon Pop",
        "category": "ui",
        "description": "Animated flat business icon",
        "animations": {"enter": ["pop", "spring_in"], "exit": ["fade"]},
        "defaults": {"label": "★", "title": "Feature", "brandColor": "#3B82F6", "textColor": "#FFFFFF"},
        "props": ["label", "title", "brandColor", "textColor"],
    },
    "whip_transition": {
        "label": "Whip Transition",
        "category": "transitions",
        "description": "Camera whip / speed-ramp transition",
        "animations": {"enter": ["wipe"], "exit": ["wipe"]},
        "defaults": {"color": "#0F172A", "accentColor": "#FFFFFF"},
        "props": ["color", "accentColor"],
    },
    "zoom_transition": {
        "label": "Zoom Transition",
        "category": "transitions",
        "description": "Punch-zoom transition",
        "animations": {"enter": ["reveal"], "exit": ["fade"]},
        "defaults": {"color": "#000000"},
        "props": ["color"],
    },
    "split_screen": {
        "label": "Split Screen",
        "category": "layouts",
        "description": "Two-panel split-screen layout",
        "animations": {"enter": ["reveal", "fade"], "exit": ["fade"]},
        "defaults": {"leftLabel": "Before", "rightLabel": "After", "brandColor": "#3B82F6", "accentColor": "#FFD600"},
        "props": ["leftLabel", "rightLabel", "brandColor", "accentColor"],
    },
    "grid_layout": {
        "label": "Grid Layout",
        "category": "layouts",
        "description": "2×2 grid layout frames",
        "animations": {"enter": ["fade"], "exit": ["fade"]},
        "defaults": {"brandColor": "#FFFFFF"},
        "props": ["brandColor"],
    },
    "glitch_overlay": {
        "label": "Glitch Overlay",
        "category": "effects",
        "description": "Raw urban glitch aesthetic",
        "animations": {"enter": ["burst", "fade"], "exit": ["fade"]},
        "defaults": {"brandColor": "#22D3EE", "accentColor": "#EF4444", "intensity": 0.5},
        "props": ["brandColor", "accentColor", "intensity"],
    },
    "paper_rip": {
        "label": "Paper Rip",
        "category": "effects",
        "description": "Tactile paper-rip edge",
        "animations": {"enter": ["reveal", "fade"], "exit": ["fade"]},
        "defaults": {"color": "#F8FAFC", "side": "bottom"},
        "props": ["color", "side"],
    },
    "collage_frame": {
        "label": "Collage Frame",
        "category": "effects",
        "description": "Mixed-media collage frames",
        "animations": {"enter": ["spring_in", "fade"], "exit": ["fade"]},
        "defaults": {"title": "COLLAGE", "brandColor": "#3B82F6", "accentColor": "#FFD600", "textColor": "#FFFFFF"},
        "props": ["title", "brandColor", "accentColor", "textColor"],
    },
    "karaoke_caption": {
        "label": "Karaoke Caption",
        "category": "typography",
        "description": "Word-highlight karaoke captions",
        "animations": {"enter": ["word_pop", "fade"], "exit": ["fade"]},
        "defaults": {"text": "Every word hits different", "color": "#FFFFFF", "accentColor": "#FFD600", "fontSize": 42},
        "props": ["text", "color", "accentColor", "fontSize"],
    },
    "doodle_scribble": {
        "label": "Doodle Scribble",
        "category": "callouts",
        "description": "Sketch-like circle or arrow outline",
        "animations": {"enter": ["draw", "spring_in"], "exit": ["fade"]},
        "defaults": {"text": "", "variant": "circle", "brandColor": "#FFD600"},
        "props": ["text", "variant", "brandColor"],
    },
    "hud_grid": {
        "label": "HUD Grid",
        "category": "effects",
        "description": "Digital HUD grid overlay",
        "animations": {"enter": ["fade"], "exit": ["fade"]},
        "defaults": {"brandColor": "#22D3EE", "intensity": 0.35},
        "props": ["brandColor", "intensity"],
    },
    "hud_loader": {
        "label": "HUD Loader",
        "category": "effects",
        "description": "HUD loading ring animation",
        "animations": {"enter": ["grow", "fade"], "exit": ["fade"]},
        "defaults": {"label": "LOADING", "brandColor": "#22D3EE", "textColor": "#FFFFFF"},
        "props": ["label", "brandColor", "textColor"],
    },
    "geometric_pattern": {
        "label": "Geometric Pattern",
        "category": "effects",
        "description": "Animated geometric pattern backdrop",
        "animations": {"enter": ["fade"], "exit": ["fade"]},
        "defaults": {"colorA": "#1E3A5F", "colorB": "#3B82F6", "intensity": 0.4},
        "props": ["colorA", "colorB", "intensity"],
    },
}


def get_component_library() -> list[dict[str, Any]]:
    """Return the component catalog for the frontend and AI prompt."""
    items: list[dict[str, Any]] = []
    for type_id, spec in COMPONENT_REGISTRY.items():
        items.append(
            {
                "type": type_id,
                "label": spec["label"],
                "category": spec["category"],
                "description": spec["description"],
                "animations": spec["animations"],
                "defaults": spec["defaults"],
                "props": spec["props"],
            }
        )
    return items


def _normalize_color(value: Any, fallback: str) -> str:
    s = str(value or fallback).strip()
    if not s.startswith("#"):
        s = f"#{s.lstrip('#')}"
    if len(s) == 4:
        s = f"#{s[1]}{s[1]}{s[2]}{s[2]}{s[3]}{s[3]}"
    return s if _HEX_COLOR.match(s) else fallback


def _clip_visual_params(clip: dict) -> dict[str, Any]:
    params: dict[str, Any] = {}
    for eff in clip.get("effects") or []:
        if isinstance(eff, dict) and eff.get("type") == "visual_overlay":
            params.update(eff.get("params") or {})
    return params


def _props_from_clip_params(params: dict[str, Any], type_id: str) -> dict[str, Any]:
    """Map timeline visual_overlay params → motion element props."""
    spec = COMPONENT_REGISTRY.get(type_id, {})
    allowed = set(spec.get("props") or [])
    defaults = dict(spec.get("defaults") or {})
    raw_motion = params.get("motion_props") or {}
    if isinstance(raw_motion, str):
        try:
            raw_motion = json.loads(raw_motion)
        except json.JSONDecodeError:
            raw_motion = {}

    props: dict[str, Any] = dict(defaults)
    if isinstance(raw_motion, dict):
        props.update(raw_motion)

    # Common text fields from legacy overlay params
    text = str(params.get("display_value") or params.get("text") or "").strip()
    secondary = str(params.get("secondary_text") or params.get("subtitle") or "").strip()
    brand = params.get("brand_color") or params.get("brandColor")

    if "text" in allowed and text and "text" not in raw_motion:
        props["text"] = text
    if "title" in allowed and text and "title" not in raw_motion:
        props["title"] = text
    if "subtitle" in allowed and secondary and "subtitle" not in raw_motion:
        props["subtitle"] = secondary
    if "author" in allowed and secondary and "author" not in raw_motion:
        props["author"] = secondary
    if "label" in allowed and secondary and "label" not in raw_motion:
        props["label"] = secondary
    if brand and "brandColor" in allowed:
        props["brandColor"] = _normalize_color(brand, str(defaults.get("brandColor", "#3B82F6")))
    if brand and "color" in allowed and type_id == "shape_transition":
        props["color"] = _normalize_color(brand, str(defaults.get("color", "#000000")))

    # Sanitize: keep only allowed props with correct types
    cleaned: dict[str, Any] = {}
    for key in allowed:
        val = props.get(key, defaults.get(key))
        if val is None:
            continue
        if key in ("fontSize", "value", "particleCount", "shapeCount", "seed", "angle", "density", "bars", "spokes", "sizePct", "lineLengthPct", "trend"):
            try:
                cleaned[key] = int(val)
            except (TypeError, ValueError):
                cleaned[key] = defaults.get(key)
        elif key == "progress":
            try:
                cleaned[key] = max(0.0, min(1.0, float(val)))
            except (TypeError, ValueError):
                cleaned[key] = defaults.get(key, 1.0)
        elif key == "intensity":
            try:
                cleaned[key] = max(0.0, min(1.0, float(val)))
            except (TypeError, ValueError):
                cleaned[key] = defaults.get(key, 0.6)
        elif key == "colors" and isinstance(val, list):
            cleaned[key] = [
                _normalize_color(c, "#FFFFFF") for c in val[:8]
            ] or defaults.get("colors", [])
        elif key in ("labels", "steps") and isinstance(val, list):
            cleaned[key] = [str(x)[:48] for x in val[:12]] or list(defaults.get(key, []))
        elif key == "values" and isinstance(val, list):
            nums: list[float] = []
            for x in val[:12]:
                try:
                    nums.append(float(x))
                except (TypeError, ValueError):
                    continue
            cleaned[key] = nums or list(defaults.get("values", []))
        elif key in (
            "color", "accentColor", "brandColor", "textColor", "strokeColor",
            "colorA", "colorB", "colorC",
        ):
            cleaned[key] = _normalize_color(val, str(defaults.get(key, "#FFFFFF")))
        elif key == "showAccentStroke":
            cleaned[key] = bool(val)
        elif key == "variant":
            allowed_variants = (
                "underline", "slash", "bracket", "slide", "glass", "accent_line",
                "wipe", "circle", "split", "fade_accent", "arrow",
            )
            cleaned[key] = str(val) if str(val) in allowed_variants else defaults.get(key)
        elif key == "device":
            cleaned[key] = str(val) if str(val) in ("phone", "tablet", "laptop") else defaults.get(key, "phone")
        elif key == "side":
            cleaned[key] = str(val) if str(val) in ("top", "bottom") else defaults.get(key, "bottom")
        elif key == "platform":
            cleaned[key] = str(val)[:24] if val else defaults.get(key, "")
        else:
            cleaned[key] = val
    return cleaned


def _normalize_spring(raw: Any, type_id: str = "") -> dict[str, float]:
    """Normalize Remotion spring physics; defaults follow blueprint family."""
    family_defaults = spring_for_type(type_id) if type_id else dict(_DEFAULT_SPRING)
    spring = dict(family_defaults)
    if not isinstance(raw, dict):
        return spring
    for key, lo, hi in (
        ("damping", 1.0, 40.0),
        ("stiffness", 20.0, 400.0),
        ("mass", 0.2, 5.0),
    ):
        default = family_defaults.get(key, _DEFAULT_SPRING[key])
        try:
            spring[key] = max(lo, min(hi, float(raw.get(key, default))))
        except (TypeError, ValueError):
            spring[key] = default
    return spring


def validate_motion_plan(
    plan: dict[str, Any],
    *,
    video_duration: float | None = None,
) -> tuple[dict[str, Any], list[str]]:
    """
    Validate and normalize a motion plan.
    Returns (normalized_plan, warnings).
    """
    warnings: list[str] = []
    duration = float(video_duration or plan.get("durationSeconds") or plan.get("duration") or 0)
    fps = int(plan.get("fps") or 30)
    width = int(plan.get("width") or 1080)
    height = int(plan.get("height") or 1920)

    raw_elements = plan.get("elements") or []
    if not isinstance(raw_elements, list):
        warnings.append("elements must be a list — using empty plan")
        raw_elements = []

    if len(raw_elements) > _MAX_ELEMENTS:
        warnings.append(f"Plan has {len(raw_elements)} elements; capped at {_MAX_ELEMENTS}")
        raw_elements = raw_elements[:_MAX_ELEMENTS]

    normalized_elements: list[dict[str, Any]] = []
    for i, el in enumerate(raw_elements):
        if not isinstance(el, dict):
            warnings.append(f"Element {i} is not an object — skipped")
            continue

        type_id = str(el.get("type") or "").lower()
        if type_id not in COMPONENT_REGISTRY:
            warnings.append(f"Unknown element type '{type_id}' — skipped")
            continue

        spec = COMPONENT_REGISTRY[type_id]
        start = max(0.0, float(el.get("startSeconds") or 0))
        end = float(el.get("endSeconds") or start + 2.0)
        if duration > 0:
            start = min(start, duration)
            end = min(end, duration)
        if end <= start:
            end = start + _MIN_DURATION
        if end - start < _MIN_DURATION:
            end = start + _MIN_DURATION

        pos = el.get("position") or {}
        x_pct = max(0.0, min(100.0, float(pos.get("xPct") if pos.get("xPct") is not None else 50)))
        y_pct = max(0.0, min(100.0, float(pos.get("yPct") if pos.get("yPct") is not None else 50)))

        anim = el.get("animation") or {}
        enter_anim = str(anim.get("enter") or spec["animations"]["enter"][0])
        exit_anim = str(anim.get("exit") or spec["animations"]["exit"][0])
        if enter_anim not in spec["animations"]["enter"]:
            warnings.append(f"Invalid enter animation '{enter_anim}' for {type_id} — using default")
            enter_anim = spec["animations"]["enter"][0]
        if exit_anim not in spec["animations"]["exit"]:
            warnings.append(f"Invalid exit animation '{exit_anim}' for {type_id} — using default")
            exit_anim = spec["animations"]["exit"][0]

        enter_dur = max(0.1, min(2.0, float(anim.get("enterDuration") or 0.5)))
        exit_dur = max(0.1, min(1.5, float(anim.get("exitDuration") or 0.35)))
        spring = _normalize_spring(anim.get("spring"), type_id)

        props_in = el.get("props") or {}
        props = _props_from_clip_params({"motion_props": props_in}, type_id)

        # Align chart labels/values lengths
        if type_id in ("bar_chart", "line_chart", "comparison_chart", "pie_chart", "funnel_chart"):
            labels = list(props.get("labels") or [])
            values = list(props.get("values") or [])
            n = min(len(labels), len(values)) or 1
            if not labels:
                labels = [f"Item {i + 1}" for i in range(len(values) or 1)]
            if not values:
                values = [50.0] * len(labels)
            n = min(len(labels), len(values), 12)
            props["labels"] = labels[:n]
            props["values"] = values[:n]

        if type_id in ("timeline_flow", "corporate_timeline"):
            steps = list(props.get("steps") or [])
            props["steps"] = steps[:8] or ["Step 1", "Step 2", "Step 3"]

        normalized_elements.append(
            {
                "id": str(el.get("id") or f"mg-{i}"),
                "type": type_id,
                "startSeconds": round(start, 3),
                "endSeconds": round(end, 3),
                "position": {"xPct": x_pct, "yPct": y_pct},
                "animation": {
                    "enter": enter_anim,
                    "exit": exit_anim,
                    "enterDuration": enter_dur,
                    "exitDuration": exit_dur,
                    "spring": spring,
                },
                "props": props,
            }
        )

    normalized = {
        "version": 1,
        "fps": fps,
        "width": width,
        "height": height,
        "durationSeconds": duration if duration > 0 else None,
        "elements": normalized_elements,
    }
    if isinstance(plan.get("theme"), dict):
        normalized["theme"] = plan["theme"]
    return normalized, warnings


def plan_from_timeline_clips(
    overlay_clips: list[dict],
    *,
    width: int = 1080,
    height: int = 1920,
    fps: int = 30,
    video_duration: float = 0,
) -> dict[str, Any]:
    """Build a motion plan from timeline overlay clips with pro motion-graphic types."""
    elements: list[dict[str, Any]] = []

    for clip in overlay_clips:
        params = _clip_visual_params(clip)
        type_id = str(params.get("visual_type") or "").lower()
        if type_id not in MOTION_GRAPHIC_TYPES:
            continue

        tl_start = float(clip.get("timeline_start") or 0)
        tl_end = float(clip.get("timeline_end") or tl_start + 2.0)
        x_pct = float(params.get("x_pct") if params.get("x_pct") is not None else 50)
        y_pct = float(params.get("y_pct") if params.get("y_pct") is not None else 50)

        anim_block = params.get("motion_animation") or {}
        if isinstance(anim_block, str):
            try:
                anim_block = json.loads(anim_block)
            except json.JSONDecodeError:
                anim_block = {}

        elements.append(
            {
                "id": str(clip.get("id") or f"clip-{len(elements)}"),
                "type": type_id,
                "startSeconds": tl_start,
                "endSeconds": tl_end,
                "position": {"xPct": x_pct, "yPct": y_pct},
                "animation": {
                    # Prefer flat motion_* fields (live editor) over motion_animation block
                    "enter": params.get("motion_enter") or anim_block.get("enter") or "",
                    "exit": params.get("motion_exit") or anim_block.get("exit") or "",
                    "enterDuration": params.get("motion_enter_duration")
                    or anim_block.get("enterDuration")
                    or 0.5,
                    "exitDuration": params.get("motion_exit_duration")
                    or anim_block.get("exitDuration")
                    or 0.35,
                    "spring": params.get("motion_spring")
                    or anim_block.get("spring")
                    or _DEFAULT_SPRING,
                },
                "props": _props_from_clip_params(params, type_id),
            }
        )

    plan, _ = validate_motion_plan(
        {
            "fps": fps,
            "width": width,
            "height": height,
            "durationSeconds": video_duration,
            "elements": elements,
        },
        video_duration=video_duration,
    )
    return plan


def detect_content_type(transcript_segments: list[dict[str, Any]], hint: str = "") -> str:
    """Infer content type from transcript keywords for smarter Magic Mode."""
    text = " ".join(str(s.get("text") or "") for s in transcript_segments[:80]).lower()
    hint_l = (hint or "").lower()
    blob = f"{hint_l} {text}"
    if any(k in blob for k in ("consult", "client", "strategy", "roi", "market share")):
        return "consultancy"
    if any(k in blob for k in ("product", "launch", "feature", "app", "saas")):
        return "product"
    if any(k in blob for k in ("podcast", "episode", "guest", "interview", "host")):
        return "podcast"
    if any(k in blob for k in ("explain", "why", "how", "history", "because")):
        return "explainer"
    return "podcast"


def prepare_motion_assets(
    transcript_segments: list[dict[str, Any]],
    *,
    brand_color: str = "#3B82F6",
    user_prompt: str = "",
) -> dict[str, Any]:
    """
    Asset preparation step for the Code-as-Video pipeline.

    Extracts numbers, locations, candidate chart series, hooks, and quote
    snippets so the AI Director has structured data (not just free text).
    """
    full_text_parts: list[str] = []
    numbers: list[dict[str, Any]] = []
    quotes: list[dict[str, Any]] = []
    locations: list[dict[str, Any]] = []
    percentages: list[dict[str, Any]] = []
    hooks: list[str] = []

    for seg in transcript_segments[:120]:
        text = str(seg.get("text") or "").strip()
        if not text:
            continue
        start = float(seg.get("start") or 0)
        end = float(seg.get("end") or start)
        full_text_parts.append(text)

        for match in _NUMBER_RE.finditer(text):
            raw = match.group(1).replace(",", "")
            suffix = (match.group(2) or "").lower()
            try:
                value = float(raw)
            except ValueError:
                continue
            is_pct = suffix == "%"
            if is_pct:
                label = f"{raw}%"
            elif suffix == "k":
                value *= 1_000
                label = f"{raw}K"
            elif suffix == "m":
                value *= 1_000_000
                label = f"{raw}M"
            elif suffix == "b":
                value *= 1_000_000_000
                label = f"{raw}B"
            else:
                label = raw
            entry = {
                "value": value,
                "label": label,
                "startSeconds": start,
                "endSeconds": end,
                "context": text[:120],
                "isPercent": is_pct,
            }
            numbers.append(entry)
            if is_pct:
                percentages.append(entry)

        for loc in _LOCATION_RE.findall(text):
            locations.append(
                {
                    "label": loc.title() if loc.lower() != "usa" else "USA",
                    "startSeconds": start,
                    "endSeconds": end,
                }
            )

        # Short punchy lines make good kinetic / quote overlays
        if 12 <= len(text) <= 140 and text.endswith((".", "!", "?", "।")):
            quotes.append({"text": text, "startSeconds": start, "endSeconds": end})

        # Opening segments → hook candidates
        if start < 8 and 8 <= len(text) <= 90:
            hooks.append(text)

    # Prefer percentages for comparison charts; otherwise first numbers
    chart_source = percentages[:4] if len(percentages) >= 2 else numbers[:6]
    chart_values = [n["value"] for n in chart_source]
    chart_labels = [n["label"] for n in chart_source]
    if len(chart_values) < 2:
        chart_labels = ["Before", "After", "Target"]
        chart_values = [40.0, 70.0, 55.0]

    compare_vals = chart_values[:2]
    compare_labels = chart_labels[:2]
    if len(compare_vals) < 2:
        compare_labels = ["Option A", "Option B"]
        compare_vals = [65.0, 35.0]

    content_type = detect_content_type(transcript_segments, user_prompt)
    hook_text = hooks[0] if hooks else (user_prompt.strip()[:80] if user_prompt.strip() else "Key insights")

    assets = {
        "brandColor": _normalize_color(brand_color, "#3B82F6"),
        "numbers": numbers[:20],
        "percentages": percentages[:10],
        "quotes": quotes[:10],
        "locations": locations[:8],
        "hooks": hooks[:5],
        "hookText": hook_text,
        "detectedContentType": content_type,
        "suggestedCharts": [
            {
                "type": "bar_chart",
                "title": "Key figures",
                "labels": chart_labels,
                "values": chart_values,
            },
            {
                "type": "comparison_chart",
                "title": "Compared",
                "labels": compare_labels,
                "values": compare_vals,
                "unit": "%" if percentages else "",
            },
        ],
        "transcriptLength": len(" ".join(full_text_parts)),
    }
    log.info(
        "motion_assets_prepared",
        numbers=len(assets["numbers"]),
        quotes=len(assets["quotes"]),
        locations=len(assets["locations"]),
        content_type=content_type,
    )
    return assets


_CONTENT_TYPE_RULES: dict[str, str] = {
    "podcast": (
        "PODCAST package — prefer: guest_intro, broadcast_lower_third / name_plate, "
        "eq_visualizer / voice_waveform / circular_waveform, soundbite / karaoke_caption, "
        "chapter_marker, focus_frame, social_frame, subscribe_badge, end_card. "
        "Avoid heavy charts unless numbers appear."
    ),
    "consultancy": (
        "CONSULTANCY package — prefer: animated_title, glass_card, authority_badge, "
        "stat_counter / data_reveal, corporate_timeline / timeline_flow, "
        "pie_chart / funnel_chart / bar_chart / comparison_chart, icon_pop, "
        "broadcast_lower_third, pro_wipe / whip_transition, end_card."
    ),
    "product": (
        "PRODUCT SHOWCASE package — prefer: product_reveal, device_mockup, "
        "product_highlight, feature_callout + callout_line, price_popup, before_after, "
        "kinetic_line, split_screen / grid_layout, liquid_blob, particle_burst, "
        "subscribe_badge, end_card."
    ),
    "explainer": (
        "VOX EXPLAINER package — prefer: animated_title, halftone, collage_frame, "
        "accent_stroke, doodle_scribble, pie_chart / bar_chart / map_pin, "
        "kinetic_text, glitch_overlay, geometric_pattern, end_card."
    ),
}


def _director_system_prompt(
    style: str,
    max_elements: int,
    density: str = "balanced",
    content_type: str = "podcast",
    preferred: list[str] | None = None,
) -> str:
    density_rules = {
        "sparse": "Use 4–8 high-impact elements only. Wide breathing room between graphics.",
        "balanced": "Use 8–12 elements. One graphic idea per beat — never stack two full-frame effects.",
        "rich": "Use 10–14 elements. Layer subtle effects under titles; still avoid clutter.",
    }.get(density, "Use 8–12 elements.")

    ct = content_type if content_type in _CONTENT_TYPE_RULES else "explainer"
    package_rules = _CONTENT_TYPE_RULES[ct]
    preferred_line = ""
    if preferred:
        preferred_line = f"\nPreferred components for this preset: {', '.join(preferred)}.\n"

    return (
        "You are the AI Director for a Code-as-Video motion graphics system. "
        "You write structured Motion Plan JSON that Remotion renders as sharp "
        "programmatic animations (never generative video).\n"
        "Return ONLY valid JSON matching this schema:\n"
        '{"version":1,"fps":30,"width":1080,"height":1920,"elements":[...]}\n'
        "Each element needs: id, type (from registry), startSeconds, endSeconds, "
        "position {xPct,yPct}, animation {enter,exit,enterDuration,exitDuration,"
        "spring:{damping,stiffness,mass}}, props.\n"
        f"Content package rules:\n{package_rules}\n"
        f"{preferred_line}"
        "General rules:\n"
        "- Hook in first 10% of video; end_card in final 8%\n"
        "- Spring physics on entrances (damping 10–16, stiffness 160–220)\n"
        "- Charts must include labels[] and values[] of equal length\n"
        "- timeline_flow must include steps[] (2–6 short labels)\n"
        f"- Density: {density_rules}\n"
        "Pacing: no two full-frame elements (end_card, shape_transition, pro_wipe, "
        "background_shader, background_gradient, texture_bg, halftone, focus_frame, "
        "product_reveal) may fully overlap.\n"
        "Use English for UI-facing labels. Video speech may be Nepali — you may "
        "put Nepali text in props.text/title when quoting the speaker.\n"
        f"Max {max_elements} elements. Every timing must fall within video duration."
    )


def _call_director_llm(system: str, user: str) -> dict[str, Any]:
    """Call the LLM director; returns a plan dict (may be empty on failure)."""
    try:
        result = call_openai_llm(system=system, user=user, max_tokens=6000, temperature=0.25)
        plan = result.content if isinstance(result.content, dict) else {}
        if not plan.get("elements"):
            raw = (result.raw_text or "").strip()
            if raw.startswith("{"):
                plan = json.loads(raw)
        if not isinstance(plan, dict):
            return {"elements": []}
        return plan
    except Exception as exc:
        log.warning("motion_graphics_director_failed", error=str(exc))
        return {"elements": []}


def _el(
    eid: str,
    type_id: str,
    start: float,
    end: float,
    props: dict[str, Any],
    *,
    enter: str = "fade",
    exit: str = "fade",
    enter_dur: float = 0.5,
    exit_dur: float = 0.35,
    x: float = 50,
    y: float = 50,
    spring: dict[str, float] | None = None,
) -> dict[str, Any]:
    return {
        "id": eid,
        "type": type_id,
        "startSeconds": start,
        "endSeconds": end,
        "position": {"xPct": x, "yPct": y},
        "animation": {
            "enter": enter,
            "exit": exit,
            "enterDuration": enter_dur,
            "exitDuration": exit_dur,
            "spring": spring or _DEFAULT_SPRING,
        },
        "props": props,
    }


def _fallback_vox_plan(
    *,
    video_duration: float,
    brand_color: str,
    assets: dict[str, Any],
    user_prompt: str,
    density: str = "balanced",
    content_type: str = "explainer",
) -> dict[str, Any]:
    """Deterministic content-type plan when the LLM is unavailable."""
    brand = _normalize_color(brand_color, "#3B82F6")
    accent = "#FFD600"
    title = str(assets.get("hookText") or user_prompt or "Key insights").strip()[:80] or "Key insights"
    dur = max(video_duration, 5.0)
    end_start = max(0.0, dur - 4.5)
    quotes = assets.get("quotes") or []
    numbers = assets.get("numbers") or []
    charts = assets.get("suggestedCharts") or []
    ct = content_type if content_type in _CONTENT_TYPE_RULES else "explainer"
    elements: list[dict[str, Any]] = []

    if ct == "podcast":
        elements.append(_el(
            "mg-guest", "guest_intro", 0.0, min(3.5, dur * 0.15),
            {"title": title[:40], "subtitle": "Episode guest", "label": "TODAY'S GUEST",
             "brandColor": brand, "accentColor": accent},
            enter="rise", enter_dur=0.7, y=42,
            spring={"damping": 12, "stiffness": 190, "mass": 1.0},
        ))
        if density != "sparse":
            elements.append(_el(
                "mg-focus", "focus_frame", 0.5, min(dur * 0.5, end_start - 0.5),
                {"brandColor": "#FFFFFF", "intensity": 0.35},
                enter="fade", enter_dur=0.8,
            ))
        elements.append(_el(
            "mg-l3", "broadcast_lower_third", min(3.0, dur * 0.12), min(7.0, dur * 0.32),
            {"title": "Host", "subtitle": "Podcast", "brandColor": brand},
            enter="slide_left", x=22, y=86,
        ))
        elements.append(_el(
            "mg-eq", "eq_visualizer", min(3.5, dur * 0.15), min(11.0, dur * 0.45),
            {"brandColor": brand, "accentColor": "#22D3EE", "bars": 22, "seed": 9},
            enter="grow", y=80,
        ))
        if quotes:
            q = quotes[0]
            start = min(float(q["startSeconds"]), end_start - 3.5)
            if start < 4:
                start = dur * 0.4
            elements.append(_el(
                "mg-bite", "soundbite", start, min(start + 3.5, end_start - 0.3),
                {"text": q["text"][:140], "label": "SOUNDBITE", "brandColor": accent, "accentColor": "#FFFFFF"},
                enter="fade_up", enter_dur=0.55,
            ))
            if density == "rich":
                elements.append(_el(
                    "mg-karaoke", "karaoke_caption", start, min(start + 3.5, end_start - 0.3),
                    {"text": q["text"][:80], "color": "#FFFFFF", "accentColor": accent, "fontSize": 40},
                    enter="word_pop", y=72,
                ))
        if dur >= 12 and density != "sparse":
            elements.append(_el(
                "mg-chapter", "chapter_marker", dur * 0.5, min(dur * 0.5 + 2.8, end_start - 0.3),
                {"title": "Chapter", "subtitle": title[:40], "brandColor": brand, "accentColor": accent},
                enter="slide_up", y=22,
            ))
        elements.append(_el(
            "mg-sub", "subscribe_badge", max(end_start - 3.0, dur * 0.7), end_start - 0.2,
            {"text": "Subscribe", "platform": "youtube", "brandColor": "#FF0000"},
            enter="pop_pulse", y=82,
        ))

    elif ct == "consultancy":
        elements.append(_el(
            "mg-hook", "animated_title", 0.0, min(3.5, dur * 0.12),
            {"text": title, "fontSize": 64, "color": "#FFFFFF", "accentColor": accent, "showAccentStroke": True},
            enter="word_pop", enter_dur=0.7, y=28,
            spring={"damping": 12, "stiffness": 200, "mass": 1.0},
        ))
        elements.append(_el(
            "mg-glass", "glass_card", min(2.8, dur * 0.12), min(6.0, dur * 0.28),
            {"title": "Strategy", "subtitle": "Clear outcomes", "brandColor": brand},
            enter="fade_up", y=55,
        ))
        elements.append(_el(
            "mg-badge", "authority_badge", min(3.2, dur * 0.14), min(6.5, dur * 0.3),
            {"title": "Trusted expertise", "subtitle": "Strategy & growth", "brandColor": brand, "accentColor": accent},
            enter="pop", y=78,
        ))
        if numbers:
            n0 = numbers[0]
            start = max(min(3.5, dur * 0.15), min(float(n0["startSeconds"]), end_start - 3))
            elements.append(_el(
                "mg-data", "data_reveal", start, min(start + 3.5, end_start - 0.3),
                {"title": "Insight", "value": int(round(float(n0["value"]))),
                 "suffix": "%" if n0.get("isPercent") else "", "label": "Key metric",
                 "brandColor": brand, "accentColor": accent},
                enter="reveal", enter_dur=0.7,
            ))
        if density != "sparse":
            elements.append(_el(
                "mg-corp", "corporate_timeline", max(dur * 0.32, 5.5), min(dur * 0.32 + 4.2, end_start - 0.3),
                {"title": "Roadmap", "steps": ["Discover", "Design", "Deliver", "Scale"],
                 "brandColor": brand, "accentColor": accent},
                enter="grow", enter_dur=0.9, x=42,
            ))
        if charts and dur >= 10:
            chart = charts[0]
            start = max(dur * 0.52, 9.0)
            chart_type = "pie_chart" if density == "rich" else (
                "comparison_chart" if assets.get("percentages") else "bar_chart"
            )
            elements.append(_el(
                "mg-chart", chart_type,
                start, min(start + 4.2, end_start - 0.3),
                {"title": chart.get("title", "Results"), "labels": chart.get("labels", ["A", "B", "C"]),
                 "values": chart.get("values", [45, 30, 25]), "brandColor": brand, "accentColor": accent,
                 "unit": chart.get("unit", "")},
                enter="grow",
            ))

    elif ct == "product":
        elements.append(_el(
            "mg-reveal", "product_reveal", 0.0, min(3.8, dur * 0.14),
            {"title": "Introducing", "subtitle": title[:50], "brandColor": brand, "accentColor": accent},
            enter="reveal", enter_dur=0.8,
            spring={"damping": 11, "stiffness": 180, "mass": 1.0},
        ))
        elements.append(_el(
            "mg-device", "device_mockup", min(3.2, dur * 0.12), min(8.0, dur * 0.35),
            {"device": "phone", "title": title[:24] or "App", "brandColor": brand, "accentColor": "#FFFFFF"},
            enter="spring_in", enter_dur=0.6,
        ))
        elements.append(_el(
            "mg-feat1", "feature_callout", max(dur * 0.28, 5.0), min(dur * 0.28 + 3.2, end_start - 0.3),
            {"title": "Key benefit", "subtitle": "Why it matters", "label": "01",
             "brandColor": brand, "accentColor": accent},
            enter="slide_left", x=28, y=38,
        ))
        if density != "sparse":
            elements.append(_el(
                "mg-callout", "callout_line", max(dur * 0.3, 5.2), min(dur * 0.3 + 2.8, end_start - 0.3),
                {"text": "Try this", "angle": -20, "brandColor": accent},
                enter="draw", x=62, y=48,
            ))
        elements.append(_el(
            "mg-price", "price_popup", max(dur * 0.45, 8.0), min(dur * 0.45 + 3.0, end_start - 0.3),
            {"title": "$49", "subtitle": "Limited offer", "label": "SAVE 40%",
             "brandColor": "#EF4444", "accentColor": accent},
            enter="pop_pulse", y=55,
        ))
        if dur >= 14 and density == "rich":
            elements.append(_el(
                "mg-ba", "before_after", max(dur * 0.55, 10.0), min(dur * 0.55 + 3.5, end_start - 0.3),
                {"beforeLabel": "Before", "afterLabel": "After", "brandColor": brand, "accentColor": "#22C55E"},
                enter="draw",
            ))
            elements.append(_el(
                "mg-burst", "particle_burst", max(dur * 0.55, 10.0), min(dur * 0.55 + 2.0, end_start - 0.3),
                {"particleCount": 36, "colors": [accent, brand, "#FFFFFF"], "seed": 7, "burstStyle": "sparkle"},
                enter="burst",
            ))
        elements.append(_el(
            "mg-sub", "subscribe_badge", end_start - 2.8, end_start - 0.2,
            {"text": "Get started", "platform": "youtube", "brandColor": brand},
            enter="pop_pulse", y=80,
        ))

    else:  # explainer / default
        if density == "rich":
            elements.append(_el(
                "mg-halftone", "halftone", 0.0, min(4.0, dur * 0.15),
                {"color": accent, "density": 16, "intensity": 0.28, "seed": 3},
                enter="reveal", enter_dur=0.8,
            ))
        elements.append(_el(
            "mg-hook", "animated_title", 0.0, min(3.8, max(2.2, dur * 0.12)),
            {"text": title, "fontSize": 68, "color": "#FFFFFF", "accentColor": accent, "showAccentStroke": True},
            enter="word_pop", enter_dur=0.7, y=28,
            spring={"damping": 12, "stiffness": 200, "mass": 1.0},
        ))
        if density != "sparse":
            elements.append(_el(
                "mg-stroke", "accent_stroke", 0.4, min(3.8, max(2.2, dur * 0.12)),
                {"label": "", "brandColor": accent, "variant": "underline"},
                enter="stroke_draw", y=38,
            ))
        if numbers:
            n0 = numbers[0]
            start = max(min(3.5, dur * 0.15), min(float(n0["startSeconds"]), end_start - 3))
            elements.append(_el(
                "mg-stat", "stat_counter", start, min(start + 3.2, end_start - 0.3),
                {"value": int(round(float(n0["value"]))), "prefix": "",
                 "suffix": "%" if n0.get("isPercent") else "", "label": "Key figure", "brandColor": brand},
                enter="count_up", enter_dur=1.1, y=42,
            ))
        if charts and dur >= 8 and density != "sparse":
            chart = charts[1] if len(charts) > 1 and assets.get("percentages") else charts[0]
            start = max(4.0, dur * 0.35)
            elements.append(_el(
                "mg-chart", chart.get("type", "bar_chart"),
                start, min(start + 4.5, end_start - 0.3),
                {"title": chart.get("title", "Key metrics"), "labels": chart.get("labels", ["A", "B", "C"]),
                 "values": chart.get("values", [40, 70, 55]), "brandColor": brand, "accentColor": accent,
                 "unit": chart.get("unit", "")},
                enter="grow",
            ))

    elements.append(_el(
        "mg-end", "end_card", end_start, dur,
        {"title": "Thanks for watching", "subtitle": "Like & subscribe",
         "handle": "@yourchannel", "brandColor": brand},
        enter="rise", enter_dur=0.6,
    ))

    return {
        "version": 1,
        "fps": 30,
        "width": 1080,
        "height": 1920,
        "elements": elements,
    }


def direct_motion_plan(
    transcript_segments: list[dict[str, Any]],
    *,
    video_duration: float,
    user_prompt: str = "",
    content_type: str = "podcast",
    brand_color: str = "#3B82F6",
    brand_kit: dict[str, Any] | None = None,
    max_elements: int = 12,
    style: str = "vox",
    density: str = "balanced",
    preset: str = "",
    width: int = 1080,
    height: int = 1920,
    fps: int = 30,
) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    """
    AI Director: natural-language prompt + transcript → validated Motion Plan.

    Pipeline step: User input → LLM Director → Asset Generation → plan JSON.
    Returns (validated_plan, warnings, assets).
    """
    preset_cfg = MAGIC_PRESETS.get(preset.lower()) if preset else None
    preferred: list[str] = []
    package = content_type
    if preset_cfg:
        user_prompt = user_prompt.strip() or preset_cfg["prompt"]
        density = preset_cfg.get("density", density)
        max_elements = int(preset_cfg.get("max_elements", max_elements))
        package = str(preset_cfg.get("package") or preset.lower())
        preferred = list(preset_cfg.get("preferred") or [])
        content_type = package

    cap = min(max_elements, _MAX_AI_ELEMENTS)
    assets = prepare_motion_assets(
        transcript_segments,
        brand_color=brand_color,
        user_prompt=user_prompt,
    )
    # Auto-detect package when preset is "auto" or no package chosen
    if package in ("auto", "", None) or (not preset_cfg and content_type in ("auto", "")):
        content_type = assets.get("detectedContentType") or "podcast"
        package = content_type
        if not preferred and content_type in MAGIC_PRESETS:
            preferred = list(MAGIC_PRESETS[content_type].get("preferred") or [])
    elif not preferred and package in MAGIC_PRESETS:
        preferred = list(MAGIC_PRESETS[package].get("preferred") or [])

    library_summary = json.dumps(get_component_library(), indent=2)
    segments_text = "\n".join(
        f"[{s.get('start', 0):.1f}s – {s.get('end', 0):.1f}s] {s.get('text', '')}"
        for s in transcript_segments[:80]
    )
    assets_summary = json.dumps(
        {
            "hookText": assets.get("hookText"),
            "numbers": assets.get("numbers", [])[:10],
            "percentages": assets.get("percentages", [])[:6],
            "locations": assets.get("locations", [])[:5],
            "quotes": assets.get("quotes", [])[:5],
            "suggestedCharts": assets.get("suggestedCharts", []),
            "detectedContentType": assets.get("detectedContentType"),
        },
        indent=2,
    )

    system = _director_system_prompt(
        style, cap, density=density, content_type=content_type, preferred=preferred,
    )
    user = (
        f"Director brief: {user_prompt or 'Create a professional video with rich motion graphics'}\n"
        f"Content type: {content_type}\n"
        f"Density: {density}\n"
        f"Video duration: {video_duration:.1f}s\n"
        f"Output size: {width}x{height} @ {fps}fps\n"
        f"Brand color: {brand_color}\n\n"
        f"Prepared assets (use these numbers/charts/locations when relevant):\n{assets_summary}\n\n"
        f"Component registry:\n{library_summary}\n\n"
        f"Transcript:\n{segments_text or '(no transcript — invent sensible timings)'}\n\n"
        "Write the full Motion Plan JSON now. Prefer prepared assets and preferred components."
    )

    plan = _call_director_llm(system, user)
    min_els = _MIN_ELEMENTS_BY_DENSITY.get(density, 5)
    # Guarantee a usable plan for one-tap non-editors (LLM empty or too thin)
    if len(plan.get("elements") or []) < min_els:
        atomic_id = (preset_cfg or {}).get("atomic_preset")
        if atomic_id and preset_cfg and preset_cfg.get("one_tap"):
            log.info(
                "motion_director_using_atomic_preset",
                atomic_preset=atomic_id,
                preset=preset,
            )
            try:
                plan = build_atomic_preset_plan(
                    str(atomic_id),
                    video_duration=video_duration,
                    brand_color=brand_color,
                    brand_kit=brand_kit,
                    width=width,
                    height=height,
                    fps=fps,
                    title=str(assets.get("hookText") or user_prompt or "")[:80],
                )
            except ValueError:
                plan = _fallback_vox_plan(
                    video_duration=video_duration,
                    brand_color=brand_color,
                    assets=assets,
                    user_prompt=user_prompt,
                    density=density,
                    content_type=content_type if content_type in _CONTENT_TYPE_RULES else "explainer",
                )
        else:
            log.info(
                "motion_director_using_fallback",
                style=style,
                density=density,
                content_type=content_type,
                llm_elements=len(plan.get("elements") or []),
            )
            plan = _fallback_vox_plan(
                video_duration=video_duration,
                brand_color=brand_color,
                assets=assets,
                user_prompt=user_prompt,
                density=density,
                content_type=content_type if content_type in _CONTENT_TYPE_RULES else "explainer",
            )

    plan.setdefault("fps", fps)
    plan.setdefault("width", width)
    plan.setdefault("height", height)
    plan["style"] = style
    plan["density"] = density
    plan["preset"] = preset or None
    plan["package"] = content_type
    plan["directorPrompt"] = (user_prompt or "")[:500]

    validated, warnings = validate_motion_plan(plan, video_duration=video_duration)
    # Enforce blueprint springs + package layout snaps (aesthetic differentiation)
    package_key = content_type if content_type in _PRESET_LAYOUT else (
        "podcast" if content_type in ("interview",) else
        "social" if content_type in ("social_reel",) else
        "consultancy" if content_type in ("pitch", "minimal") else
        "product" if content_type in ("launch", "demo", "product_showcase") else
        content_type
    )
    validated = apply_preset_layout(validated, package_key)
    # Cap to max_elements after validation (fallback may be generous)
    if len(validated.get("elements") or []) > cap:
        validated["elements"] = validated["elements"][:cap]
        warnings.append(f"Capped plan at {cap} elements for this preset")

    from services.brand_theme_service import attach_theme_to_plan

    validated = attach_theme_to_plan(
        validated,
        brand_kit=brand_kit,
        brand_color=brand_color,
        accent_color=(brand_kit or {}).get("accent_color") or (brand_kit or {}).get("accentColor"),
    )

    log.info(
        "motion_director_complete",
        elements=len(validated.get("elements") or []),
        warnings=len(warnings),
        style=style,
        density=density,
        content_type=content_type,
        preset=preset or None,
    )
    return validated, warnings, assets


def suggest_motion_placements(
    transcript_segments: list[dict[str, Any]],
    *,
    video_duration: float,
    content_type: str = "podcast",
    brand_color: str = "#3B82F6",
    max_elements: int = 8,
    user_prompt: str = "",
    style: str = "default",
) -> tuple[dict[str, Any], list[str]]:
    """
    Use LLM to suggest motion graphic placements from transcript.
    When user_prompt or style=vox is set, delegates to the AI Director.
    Returns (validated_plan, warnings).
    """
    if user_prompt.strip() or style.lower() in (
        "vox", "magic", "magic_vox", "consultancy", "podcast", "product", "explainer",
    ):
        plan, warnings, _assets = direct_motion_plan(
            transcript_segments,
            video_duration=video_duration,
            user_prompt=user_prompt,
            content_type=content_type,
            brand_color=brand_color,
            max_elements=max_elements,
            style=style if style.lower() != "default" else "vox",
        )
        return plan, warnings

    cap = min(max_elements, _MAX_AI_ELEMENTS)
    library_summary = json.dumps(get_component_library(), indent=2)
    segments_text = "\n".join(
        f"[{s.get('start', 0):.1f}s – {s.get('end', 0):.1f}s] {s.get('text', '')}"
        for s in transcript_segments[:80]
    )

    system = _director_system_prompt("default", cap)
    user = (
        f"Content type: {content_type}\n"
        f"Video duration: {video_duration:.1f}s\n"
        f"Brand color: {brand_color}\n\n"
        f"Component registry:\n{library_summary}\n\n"
        f"Transcript:\n{segments_text}\n\n"
        "Suggest motion graphics placements as JSON."
    )

    plan = _call_director_llm(system, user)
    plan.setdefault("fps", 30)
    plan.setdefault("width", 1080)
    plan.setdefault("height", 1920)
    return validate_motion_plan(plan, video_duration=video_duration)


async def render_motion_graphics_for_timeline(
    overlay_clips: list[dict],
    *,
    video_path: str,
    output_path: str,
    width: int,
    height: int,
    fps: int = 30,
    video_duration: float = 0,
) -> bool:
    """
    Render motion graphics overlay and composite onto video.
    Returns True on success, False if skipped or failed (non-fatal).
    """
    from processors.remotion_client import (
        composite_overlay_onto_video,
        render_motion_graphics_overlay,
    )

    plan = plan_from_timeline_clips(
        overlay_clips,
        width=width,
        height=height,
        fps=fps,
        video_duration=video_duration,
    )
    if not plan.get("elements"):
        return False

    try:
        overlay_path = await render_motion_graphics_overlay(
            plan,
            duration=video_duration,
            width=width,
            height=height,
            fps=fps,
        )
        composite_overlay_onto_video(video_path, overlay_path, output_path)
        try:
            from pathlib import Path
            Path(overlay_path).unlink(missing_ok=True)
        except OSError:
            pass
        return True
    except Exception as exc:
        log.warning("motion_graphics_render_failed", error=str(exc))
        return False
