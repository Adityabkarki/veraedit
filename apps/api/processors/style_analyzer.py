"""
ViraEdit — Video style analyzer (Module 02).

Samples frames from a reference video, calls Gemini vision when configured,
and builds a reusable edit template JSON with placeholder slots.
"""
from __future__ import annotations

import base64
import io
import json
import logging
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image

from config import settings
from processors.downloader import extract_metadata

log = logging.getLogger("viraedit.processors.style_analyzer")

DEFAULT_STYLE_ANALYSIS: dict[str, Any] = {
    "caption_style": {
        "position": "bottom_third",
        "animation": "word_by_word",
        "has_highlight": True,
        "highlight_color": "#f5c518",
        "font_weight": "bold",
        "has_emoji": False,
        "background": "semi_transparent",
    },
    "text_overlays": [{"type": "hook", "style": "Bold opening statement"}],
    "transitions": ["cut"],
    "pacing": "medium",
    "hook_style": "statement",
    "visual_style": "ugc",
    "layout_zones": {
        "safe_zone_top": 0.15,
        "safe_zone_bottom": 0.2,
        "text_zone": "bottom_third",
    },
    "estimated_clip_count": 3,
    "has_background_music": True,
    "has_sound_effects": False,
}


def get_video_meta(video_path: Path) -> dict[str, Any]:
    """Return duration and resolution via shared ffprobe helper."""
    meta = extract_metadata(video_path)
    return {
        "duration": meta.get("duration", 30.0),
        "width": meta.get("width", 1080),
        "height": meta.get("height", 1920),
        "fps": meta.get("fps", 30.0),
    }


def extract_key_frames(
    video_path: Path,
    max_frames: int = 15,
    interval_sec: float = 2.0,
) -> list[Image.Image]:
    """Sample evenly spaced frames for vision analysis."""
    cap = cv2.VideoCapture(video_path.as_posix())
    if not cap.isOpened():
        return []

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    interval_frames = max(int(fps * interval_sec), 1)
    frames: list[Image.Image] = []
    frame_idx = 0

    while cap.isOpened() and len(frames) < max_frames:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            break
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frames.append(Image.fromarray(rgb))
        frame_idx += interval_frames

    cap.release()
    return frames


def detect_scene_cuts(video_path: Path) -> list[float]:
    """Return scene cut timestamps in seconds."""
    try:
        from scenedetect import ContentDetector, detect

        scene_list = detect(video_path.as_posix(), ContentDetector(threshold=27.0))
        return [round(scene[0].get_seconds(), 2) for scene in scene_list]
    except Exception as exc:
        log.warning("scene_detect_failed: %s", exc)
        return []


def extract_color_palette(
    frame: Image.Image | None,
    num_colors: int = 5,
) -> list[str]:
    """Dominant colors as hex strings."""
    if frame is None:
        return ["#1a1a1a", "#ffffff", "#f5c518"]

    img_array = (
        np.array(frame.resize((150, 150))).reshape(-1, 3).astype(np.float32)
    )
    _criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 0.2)
    _, _labels, centers = cv2.kmeans(
        img_array,
        num_colors,
        None,
        _criteria,
        10,
        cv2.KMEANS_RANDOM_CENTERS,
    )
    centers = centers.astype(int)
    return [f"#{r:02x}{g:02x}{b:02x}" for r, g, b in centers]


def _parse_gemini_json(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```")[1].lstrip("json").strip()
    return json.loads(text)


async def gemini_analyze_frames(
    frames: list[Image.Image],
    meta: dict[str, Any],
    scene_cuts: list[float],
) -> dict[str, Any]:
    """Call Gemini vision when API key is configured."""
    if not settings.GEMINI_API_KEY:
        log.info("gemini_skipped_no_api_key")
        return dict(DEFAULT_STYLE_ANALYSIS)

    try:
        import google.generativeai as genai
    except ImportError as exc:
        log.warning("google_generativeai_missing: %s", exc)
        return dict(DEFAULT_STYLE_ANALYSIS)

    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel(settings.GEMINI_VISION_MODEL)

    frame_parts: list[dict[str, Any]] = []
    for frame in frames[:8]:
        buf = io.BytesIO()
        frame.save(buf, format="JPEG", quality=80)
        b64 = base64.b64encode(buf.getvalue()).decode()
        frame_parts.append({"inline_data": {"mime_type": "image/jpeg", "data": b64}})

    prompt = f"""
You are a video style analyst. Analyze these {len(frames)} frames from a video and extract its editing style.
Video info: {meta['duration']:.1f}s, {meta['width']}x{meta['height']}, ~{len(scene_cuts)} scene cuts.
Return ONLY valid JSON with this exact structure:
{{
  "caption_style": {{
    "position": "bottom_third|center|top_third",
    "animation": "word_by_word|sentence|fade|pop",
    "has_highlight": true|false,
    "highlight_color": "#hex or null",
    "font_weight": "bold|normal",
    "has_emoji": true|false,
    "background": "none|semi_transparent|solid"
  }},
  "text_overlays": [
    {{"type": "hook|title|lower_third|cta", "style": "description"}}
  ],
  "transitions": ["zoom_in", "cut", "fade"],
  "pacing": "fast|medium|slow",
  "hook_style": "question|statement|statistic|story",
  "visual_style": "minimalist|bold|cinematic|ugc|corporate",
  "layout_zones": {{
    "safe_zone_top": 0.15,
    "safe_zone_bottom": 0.2,
    "text_zone": "bottom_third"
  }},
  "estimated_clip_count": 3,
  "has_background_music": true|false,
  "has_sound_effects": true|false
}}
"""
    try:
        response = model.generate_content([prompt] + frame_parts)
        return _parse_gemini_json(response.text or "{}")
    except Exception as exc:
        log.warning("gemini_analyze_failed: %s", exc)
        return dict(DEFAULT_STYLE_ANALYSIS)


def build_template(
    style: dict[str, Any],
    meta: dict[str, Any],
    palette: list[str],
    scene_cuts: list[float],
) -> dict[str, Any]:
    """Assemble the template JSON with video/text placeholder slots."""
    clip_count = max(style.get("estimated_clip_count", 2), len(scene_cuts) or 2)
    duration = float(meta["duration"])
    clip_duration = duration / clip_count if clip_count else duration
    layers: list[dict[str, Any]] = []

    for i in range(clip_count):
        start = i * clip_duration
        end = (i + 1) * clip_duration
        layers.append({
            "type": "video_placeholder",
            "start": round(start, 2),
            "end": round(end, 2),
            "slot": f"clip_{i + 1}",
            "label": (
                "Hook clip"
                if i == 0
                else ("Main content" if i < clip_count - 1 else "Outro")
            ),
        })
        if i < clip_count - 1:
            transitions = style.get("transitions", ["cut"])
            effect = transitions[i % len(transitions)]
            layers.append({"type": "transition", "at": round(end, 2), "effect": effect})

    layers.append({
        "type": "caption_track",
        "start": 0,
        "end": round(duration, 2),
        "style": style.get("caption_style", {}),
    })

    for overlay in style.get("text_overlays", []):
        layers.append({
            "type": "text_overlay",
            "slot": overlay.get("type", "title"),
            "label": overlay.get("style", ""),
            "start": 0,
            "end": 3,
        })

    w, h = int(meta["width"]), int(meta["height"])
    gcd = np.gcd(w, h) if w and h else 1
    aspect = f"{w // gcd}:{h // gcd}" if gcd else "9:16"

    return {
        "version": "1.0",
        "duration": round(duration, 2),
        "aspect_ratio": aspect,
        "color_palette": palette,
        "pacing": style.get("pacing", "medium"),
        "visual_style": style.get("visual_style", "ugc"),
        "hook_style": style.get("hook_style", "statement"),
        "layers": layers,
        "audio": {
            "background_music": style.get("has_background_music", False),
            "sound_effects": style.get("has_sound_effects", False),
            "bg_music_volume": 0.12,
        },
        "caption_style": style.get("caption_style", {}),
        "scene_cuts": scene_cuts,
    }


async def analyze_video_style(video_path: Path, project_id: str) -> dict[str, Any]:
    """
    Main entry: sample frames, detect cuts, analyze style, return template JSON.
    """
    meta = get_video_meta(video_path)
    frames = extract_key_frames(video_path)
    scene_cuts = detect_scene_cuts(video_path)
    palette = extract_color_palette(frames[0] if frames else None)
    style_analysis = await gemini_analyze_frames(frames, meta, scene_cuts)
    template = build_template(style_analysis, meta, palette, scene_cuts)
    template["project_id"] = project_id
    return template
