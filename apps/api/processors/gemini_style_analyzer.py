"""
ViraEdit — Gemini 2.0 Flash native video style fingerprinting (Phase 01).

Produces v2.1 Director's Blueprint templates with slot-level requirements
for Phase 2 matching, plus audio_profile and director_notes.
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
from services.ai_costs import COSTS
from tasks.llm_json_utils import extract_json

log = structlog.get_logger("viraedit.gemini_style_analyzer")

_GEMINI_ANALYSIS_COST_USD = COSTS["gemini_video_analysis_flat"]

_FINGERPRINT_PROMPT = """You are an expert video editor AND sound designer analyzing
a reference video to create a reusable EDITING BLUEPRINT. Someone with ZERO video
editing skills will use this blueprint to make their own version by swapping in
their own footage, text, and using your suggested music style — so think like a
creative director giving precise instructions to a production team, covering both
what is SEEN and what is HEARD.

Watch and LISTEN to the full video. Return ONLY valid JSON (no markdown) in this
exact schema:

{
  "duration": 30.0,
  "aspect_ratio": "9:16",
  "color_palette": ["#hex1", "#hex2", "#hex3"],
  "pacing": "fast|medium|slow",
  "visual_style": "minimalist|bold|cinematic|ugc|corporate",
  "caption_style": {
    "position": "bottom_third|center|top_third",
    "animation": "word_by_word|sentence|fade",
    "has_highlight": true,
    "highlight_color": "#hex or null",
    "has_emoji": true
  },
  "audio_profile": {
    "music_genre": "describe the genre/mood of any background music, or 'none'",
    "music_energy_arc": "builds steadily|high throughout|calm with one peak|none",
    "has_sfx_hits": true,
    "sfx_style": "describe any whooshes, risers, bass drops, impact sounds on cuts, or null",
    "music_ducking_behavior": "music drops significantly under VO|music stays constant|no music",
    "voice_emotion_arc": "describe how the speaker's tone/energy changes through the video"
  },
  "director_notes": [
    "0.0s-3.5s: description of what happens and why, in plain creative-director language",
    "..."
  ],
  "slots": [
    {
      "slot_id": "clip_1",
      "type": "video_placeholder",
      "start": 0.0,
      "end": 3.5,
      "label": "Opening hook",
      "audio_cue": "describe any specific sound effect or music behavior tied to this exact slot, or null",
      "requirement": {
        "shot_type": "talking_head",
        "energy_level": "high_energy",
        "min_duration": 3.0,
        "max_duration": 4.0,
        "needs_face": true,
        "setting_hint": "indoor or studio",
        "description": "Energetic close-up of speaker reacting directly to camera"
      }
    }
  ],
  "transitions": [
    {"at": 3.5, "effect": "zoom_in"}
  ]
}

Rules:
- shot_type must be one of: talking_head, b_roll, screen_recording, product_shot,
  text_card, logo, establishing_shot, action, interview
- energy_level must be one of: calm, moderate, high_energy
- Be SPECIFIC in every description field — an automated system will use these
  exact words to search for or generate matching content
- Every video_placeholder slot MUST have a requirement object
- audio_cue should be null unless there is a genuinely distinct sound moment tied
  to that specific slot (don't force one onto every slot)
- director_notes should read like real shot notes a senior editor would leave for
  a junior editor — concrete, timestamped, actionable
"""


def _default_audio_profile(pacing: str = "medium", legacy_mood: str | None = None) -> dict[str, Any]:
    """Fallback audio profile when Gemini or frame analysis omits it."""
    if legacy_mood and str(legacy_mood).lower() not in ("none", ""):
        mood = str(legacy_mood).lower()
        return {
            "music_genre": mood,
            "music_energy_arc": "high throughout" if mood == "upbeat" else "calm with one peak",
            "has_sfx_hits": False,
            "sfx_style": None,
            "music_ducking_behavior": "music stays constant",
            "voice_emotion_arc": "consistently moderate",
        }
    energy_arc = (
        "high throughout" if pacing == "fast"
        else "calm with one peak" if pacing == "slow"
        else "builds steadily"
    )
    return {
        "music_genre": "none",
        "music_energy_arc": energy_arc,
        "has_sfx_hits": False,
        "sfx_style": None,
        "music_ducking_behavior": "no music",
        "voice_emotion_arc": "consistently moderate",
    }


def _ensure_v21_fields(template: dict[str, Any]) -> dict[str, Any]:
    """Ensure v2.1 blueprint fields exist for validation and downstream render."""
    pacing = template.get("pacing", "medium")
    if not template.get("audio_profile"):
        template["audio_profile"] = _default_audio_profile(
            pacing, template.get("music_mood")
        )
    if "director_notes" not in template:
        template["director_notes"] = []
    for slot in template.get("slots", []):
        if "audio_cue" not in slot:
            slot["audio_cue"] = None
    template["version"] = "2.1"
    return template


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
    return _ensure_v21_fields(template)


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

    return _ensure_v21_fields({
        "version": "2.1",
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
    })


async def _analyze_with_gemini_video(
    video_path: Path,
    *,
    project_id: str | None = None,
    job_id: str | None = None,
    workspace_id: str | None = None,
) -> dict[str, Any]:
    import google.generativeai as genai

    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel(settings.GEMINI_VISION_MODEL)

    video_file = genai.upload_file(path=video_path.as_posix())
    max_wait = 120
    waited = 0
    while video_file.state.name == "PROCESSING":
        if waited >= max_wait:
            raise TimeoutError("Gemini video processing timed out")
        time.sleep(2)
        waited += 2
        video_file = genai.get_file(video_file.name)

    if video_file.state.name == "FAILED":
        raise RuntimeError("Gemini failed to process the reference video")

    try:
        response = model.generate_content(
            [_FINGERPRINT_PROMPT, video_file],
            generation_config={"temperature": 0.2, "max_output_tokens": 2000},
            request_options={"timeout": 120000},
        )
        raw = (response.text or "").strip()
        template = extract_json(raw)
    finally:
        try:
            genai.delete_file(video_file.name)
        except Exception as exc:
            log.warning("gemini_file_cleanup_failed", error=str(exc))

    budget.record(
        _GEMINI_ANALYSIS_COST_USD,
        action="style_analyze",
        workspace_id=workspace_id or project_id,
        project_id=project_id,
        job_id=job_id,
        provider="gemini",
        model=settings.GEMINI_VISION_MODEL,
    )
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
    job_id: str | None = None,
    workspace_id: str | None = None,
) -> dict[str, Any]:
    """
    Produce a rich v2.1 Director's Blueprint from a reference video.

    Uses Gemini native video when configured; falls back to frame analysis.
    """
    if settings.GEMINI_API_KEY:
        try:
            template = await _analyze_with_gemini_video(
                video_path,
                project_id=project_id,
                job_id=job_id,
                workspace_id=workspace_id,
            )
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
