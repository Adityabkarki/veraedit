"""
ViraEdit — Gemini 2.0 Flash native video style fingerprinting (Phase 01).

Produces v2.0 templates with slot-level requirements for Phase 2 matching.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import structlog

from config import settings
from schemas.template import StyleTemplate
from services.ai_budget import budget
from tasks.llm_json_utils import extract_json

log = structlog.get_logger("viraedit.gemini_style_analyzer")

_GEMINI_ANALYSIS_COST_USD = 0.05

_FINGERPRINT_PROMPT = """You are an expert video editor analyzing a reference video to
create a reusable EDITING TEMPLATE. Someone with ZERO video editing skills will use this
template to make their own version by swapping in their own footage and text — so every
slot description must be precise and concrete enough that an automated system can find
or generate a matching clip.

Watch the full video and return ONLY valid JSON (no markdown) in this exact schema:

{
  "duration": 30.0,
  "aspect_ratio": "9:16",
  "color_palette": ["#hex1", "#hex2", "#hex3"],
  "pacing": "fast|medium|slow",
  "visual_style": "minimalist|bold|cinematic|ugc|corporate",
  "music_mood": "upbeat|calm|dramatic|none",
  "caption_style": {
    "position": "bottom_third|center|top_third",
    "animation": "word_by_word|sentence|fade",
    "has_highlight": true,
    "highlight_color": "#hex or null",
    "has_emoji": true
  },
  "slots": [
    {
      "slot_id": "clip_1",
      "type": "video_placeholder",
      "start": 0.0,
      "end": 3.5,
      "label": "Opening hook",
      "requirement": {
        "shot_type": "talking_head",
        "energy_level": "high_energy",
        "min_duration": 3.0,
        "max_duration": 4.0,
        "needs_face": true,
        "setting_hint": "indoor or studio",
        "description": "Energetic close-up of speaker reacting directly to camera with surprised expression"
      }
    },
    {
      "slot_id": "hook_text",
      "type": "text_overlay",
      "start": 0.0,
      "end": 3.0,
      "label": "Hook headline text",
      "requirement": null
    }
  ],
  "transitions": [
    {"at": 3.5, "effect": "zoom_in"}
  ]
}

Rules for slot requirements:
- shot_type must be one of: talking_head, b_roll, screen_recording, product_shot,
  text_card, logo, establishing_shot, action, interview
- energy_level must be one of: calm, moderate, high_energy
- Be SPECIFIC in description — not "main content" but "Close-up of hands typing on
  laptop keyboard, screen recording style, calm pacing"
- Every video_placeholder slot MUST have a requirement object
- text_overlay and transition entries have requirement: null
"""


def _ensure_video_slot_requirements(template: dict[str, Any]) -> dict[str, Any]:
    """Fill missing requirements on video slots so Phase 2 can always match."""
    pacing = template.get("pacing", "medium")
    energy = "high_energy" if pacing == "fast" else "calm" if pacing == "slow" else "moderate"

    for slot in template.get("slots", []):
        if slot.get("type") != "video_placeholder":
            slot["requirement"] = None
            continue
        if slot.get("requirement"):
            continue
        duration = max(0.5, float(slot.get("end", 0)) - float(slot.get("start", 0)))
        slot["requirement"] = {
            "shot_type": "talking_head",
            "energy_level": energy,
            "min_duration": round(duration * 0.8, 2),
            "max_duration": round(duration * 1.2, 2),
            "needs_face": False,
            "setting_hint": None,
            "description": slot.get("label") or "Video clip matching reference style",
        }
    return template


def _convert_v1_to_v2(v1: dict[str, Any]) -> dict[str, Any]:
    """Convert legacy v1.0 layer template to v2.0 slot schema."""
    pacing = v1.get("pacing", "medium")
    energy = "high_energy" if pacing == "fast" else "calm" if pacing == "slow" else "moderate"
    slots: list[dict[str, Any]] = []

    for layer in v1.get("layers", []):
        layer_type = layer.get("type", "video_placeholder")
        start = float(layer.get("start", 0))
        end = float(layer.get("end", start + 1))
        slot: dict[str, Any] = {
            "slot_id": layer.get("slot") or layer.get("id") or f"slot_{len(slots) + 1}",
            "type": layer_type if layer_type in {
                "video_placeholder", "text_overlay", "image_placeholder", "logo_placeholder"
            } else "video_placeholder",
            "start": start,
            "end": end,
            "label": layer.get("label") or layer_type.replace("_", " ").title(),
            "requirement": None,
        }
        if slot["type"] == "video_placeholder":
            duration = max(0.5, end - start)
            slot["requirement"] = {
                "shot_type": "talking_head",
                "energy_level": energy,
                "min_duration": round(duration * 0.8, 2),
                "max_duration": round(duration * 1.2, 2),
                "needs_face": False,
                "description": slot["label"],
            }
        slots.append(slot)

    transitions = [
        {"at": layer.get("at", layer.get("start", 0)), "effect": layer.get("effect", "cut")}
        for layer in v1.get("layers", [])
        if layer.get("type") == "transition"
    ]

    return {
        "version": "2.0",
        "source_url": v1.get("source_url"),
        "duration": float(v1.get("duration", 30)),
        "aspect_ratio": v1.get("aspect_ratio", "9:16"),
        "color_palette": v1.get("color_palette", []),
        "pacing": pacing,
        "visual_style": v1.get("visual_style", "ugc"),
        "caption_style": v1.get("caption_style", {}),
        "music_mood": v1.get("music_mood"),
        "slots": slots,
        "transitions": transitions or v1.get("transitions", []),
    }


async def _analyze_with_gemini_video(video_path: Path) -> dict[str, Any]:
    import google.generativeai as genai

    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel(settings.GEMINI_VISION_MODEL)

    video_file = genai.upload_file(path=video_path.as_posix())
    while video_file.state.name == "PROCESSING":
        time.sleep(2)
        video_file = genai.get_file(video_file.name)

    if video_file.state.name == "FAILED":
        raise RuntimeError("Gemini failed to process the reference video")

    try:
        response = model.generate_content(
            [_FINGERPRINT_PROMPT, video_file],
            generation_config={"temperature": 0.2, "max_output_tokens": 2000},
        )
        raw = (response.text or "").strip()
        template = extract_json(raw)
    finally:
        try:
            genai.delete_file(video_file.name)
        except Exception as exc:
            log.warning("gemini_file_cleanup_failed", error=str(exc))

    budget.record(_GEMINI_ANALYSIS_COST_USD, task="style_intelligence")
    template["version"] = "2.0"
    return _ensure_video_slot_requirements(template)


async def _analyze_with_frame_fallback(video_path: Path, project_id: str) -> dict[str, Any]:
    """Frame-based fallback when Gemini native video is unavailable."""
    from processors.style_analyzer import analyze_video_style

    v1 = await analyze_video_style(video_path, project_id)
    v2 = _convert_v1_to_v2(v1)
    log.info("style_intelligence_frame_fallback", project_id=project_id)
    return _ensure_video_slot_requirements(v2)


async def analyze_reference_video(
    video_path: Path,
    project_id: str,
    *,
    source_url: str | None = None,
) -> dict[str, Any]:
    """
    Produce a rich v2.0 style template from a reference video.

    Uses Gemini native video when configured; falls back to frame analysis.
    """
    if settings.GEMINI_API_KEY:
        try:
            template = await _analyze_with_gemini_video(video_path)
            if source_url:
                template["source_url"] = source_url
            validated = StyleTemplate.model_validate(template)
            return validated.model_dump()
        except Exception as exc:
            log.warning("gemini_video_analysis_failed", error=str(exc))

    template = await _analyze_with_frame_fallback(video_path, project_id)
    if source_url:
        template["source_url"] = source_url
    validated = StyleTemplate.model_validate(template)
    return validated.model_dump()
