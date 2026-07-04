"""
ViraEdit — Motion graphics service.

Component registry, motion-plan validation, timeline → plan conversion,
and AI placement suggestions for Remotion-rendered overlays.
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
        "animated_title",
        "kinetic_text",
        "lower_third_pro",
        "stat_counter",
        "quote_callout",
        "cta_badge",
        "progress_timer",
        "particle_burst",
        "shape_transition",
        "background_gradient",
        "arrow_callout",
        "end_card",
    }
)

_HEX_COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")
_MAX_ELEMENTS = 30
_MAX_AI_ELEMENTS = 12
_MIN_DURATION = 0.3

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
        },
        "props": ["text", "fontSize", "color", "accentColor"],
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
        },
        "props": ["title", "subtitle", "brandColor", "variant"],
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
        },
        "props": ["value", "prefix", "suffix", "label", "brandColor"],
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
        },
        "props": ["text", "author", "brandColor"],
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
            "direction": "ltr",
        },
        "props": ["label", "brandColor", "direction"],
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
        },
        "props": ["title", "subtitle", "handle", "brandColor"],
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
        if key in ("fontSize", "value", "particleCount", "shapeCount", "seed", "angle"):
            try:
                cleaned[key] = int(val)
            except (TypeError, ValueError):
                cleaned[key] = defaults.get(key)
        elif key == "colors" and isinstance(val, list):
            cleaned[key] = [
                _normalize_color(c, "#FFFFFF") for c in val[:8]
            ] or defaults.get("colors", [])
        elif key in ("color", "accentColor", "brandColor", "textColor", "colorA", "colorB"):
            cleaned[key] = _normalize_color(val, str(defaults.get(key, "#FFFFFF")))
        else:
            cleaned[key] = val
    return cleaned


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

        props_in = el.get("props") or {}
        props = _props_from_clip_params({"motion_props": props_in}, type_id)

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
                    "enter": anim_block.get("enter") or params.get("motion_enter") or "",
                    "exit": anim_block.get("exit") or params.get("motion_exit") or "",
                    "enterDuration": anim_block.get("enterDuration") or params.get("motion_enter_duration") or 0.5,
                    "exitDuration": anim_block.get("exitDuration") or params.get("motion_exit_duration") or 0.35,
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


def suggest_motion_placements(
    transcript_segments: list[dict[str, Any]],
    *,
    video_duration: float,
    content_type: str = "podcast",
    brand_color: str = "#3B82F6",
    max_elements: int = 8,
) -> tuple[dict[str, Any], list[str]]:
    """
    Use LLM to suggest motion graphic placements from transcript.
    Returns (validated_plan, warnings).
    """
    cap = min(max_elements, _MAX_AI_ELEMENTS)
    library_summary = json.dumps(get_component_library(), indent=2)
    segments_text = "\n".join(
        f"[{s.get('start', 0):.1f}s – {s.get('end', 0):.1f}s] {s.get('text', '')}"
        for s in transcript_segments[:80]
    )

    system = (
        "You are a professional video editor suggesting motion graphics placements. "
        "Return ONLY valid JSON matching this schema:\n"
        '{"version":1,"fps":30,"width":1080,"height":1920,"elements":[...]}\n'
        "Each element needs: id, type (from registry), startSeconds, endSeconds, "
        "position {xPct,yPct}, animation {enter,exit,enterDuration,exitDuration}, props.\n"
        "Use English for all suggestion labels in props. Video speech may be Nepali — "
        "you may put Nepali text in props.text/title when quoting the speaker.\n"
        f"Max {cap} elements. Prefer hooks at start, lower thirds on speaker intro, "
        "stat_counter for numbers, end_card in last 5 seconds."
    )
    user = (
        f"Content type: {content_type}\n"
        f"Video duration: {video_duration:.1f}s\n"
        f"Brand color: {brand_color}\n\n"
        f"Component registry:\n{library_summary}\n\n"
        f"Transcript:\n{segments_text}\n\n"
        "Suggest motion graphics placements as JSON."
    )

    try:
        result = call_openai_llm(system=system, user=user, max_tokens=4096, temperature=0.2)
        plan = result.content if isinstance(result.content, dict) else {}
        if not plan.get("elements"):
            raw = result.raw_text
            plan = json.loads(raw) if raw.strip().startswith("{") else {}
    except Exception as exc:
        log.warning("motion_graphics_suggest_failed", error=str(exc))
        plan = {"elements": []}

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
