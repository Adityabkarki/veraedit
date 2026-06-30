"""
ViraEdit — Auto-tag library assets with GPT-4o-mini vision (Phase 00).

Samples frames from video or sends a single image to vision LLM and returns
structured AssetTags JSON for template slot matching.
"""
from __future__ import annotations

import base64
import io
from pathlib import Path

import cv2
import structlog
from openai import AsyncOpenAI
from PIL import Image

from config import settings
from schemas.asset_tags import AssetTags
from services.ai_costs import COSTS
from tasks.llm_json_utils import extract_json

log = structlog.get_logger("viraedit.asset_tagger")

_TAGGING_PROMPT = """Analyze this visual asset and return ONLY valid JSON (no markdown) matching this exact schema:
{
  "shot_type": "talking_head|b_roll|screen_recording|product_shot|text_card|logo|establishing_shot|action|interview|unknown",
  "subject_count": 0,
  "has_face": false,
  "setting": "indoor|outdoor|studio|office|unknown",
  "energy_level": "calm|moderate|high_energy",
  "emotion": "neutral|happy|serious|excited|informative|unknown",
  "dominant_colors": ["#hex1", "#hex2"],
  "aspect_ratio": "16:9",
  "is_landscape_orientation": true,
  "has_text_overlay": false,
  "description": "one sentence plain description",
  "tagging_confidence": 0.9
}"""

_IMAGE_TAG_COST_USD = COSTS["openai_gpt4o_mini_vision_call"]
_VIDEO_TAG_COST_USD = COSTS["openai_gpt4o_mini_video_tag_call"]

_DEFAULT_TAGS: dict = {
    "shot_type": "unknown",
    "subject_count": 0,
    "has_face": False,
    "setting": "unknown",
    "energy_level": "moderate",
    "emotion": "unknown",
    "dominant_colors": ["#1a1a1a", "#ffffff"],
    "aspect_ratio": "16:9",
    "is_landscape_orientation": True,
    "has_text_overlay": False,
    "has_spoken_audio": False,
    "duration_seconds": None,
    "description": "Asset could not be analyzed automatically.",
    "tagging_confidence": 0.0,
}


def _normalize_tags(raw: dict, *, duration_seconds: float | None = None, has_audio: bool = False) -> dict:
    tags = dict(_DEFAULT_TAGS)
    tags.update({k: v for k, v in raw.items() if k in AssetTags.model_fields})
    if duration_seconds is not None:
        tags["duration_seconds"] = round(duration_seconds, 2)
    tags["has_spoken_audio"] = has_audio
    validated = AssetTags.model_validate(tags)
    return validated.model_dump()


def _fallback_tags(
    *,
    duration_seconds: float | None = None,
    has_audio: bool = False,
    reason: str,
) -> dict:
    log.warning("asset_tag_fallback", reason=reason)
    tags = dict(_DEFAULT_TAGS)
    tags["description"] = reason
    return _normalize_tags(tags, duration_seconds=duration_seconds, has_audio=has_audio)


async def _vision_tag(content: list[dict]) -> dict:
    if not settings.OPENAI_API_KEY:
        return _fallback_tags(reason="OpenAI API key is not configured for asset tagging.")

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    resp = await client.chat.completions.create(
        model=settings.OPENAI_MODEL_PRIMARY,
        messages=[{"role": "user", "content": content}],
        max_tokens=400,
        temperature=0.1,
    )
    raw = (resp.choices[0].message.content or "").strip()
    return extract_json(raw)


def _encode_image_file(image_path: Path) -> str:
    with image_path.open("rb") as f:
        return base64.b64encode(f.read()).decode()


def _sample_video_frames(video_path: Path) -> tuple[list[str], float]:
    cap = cv2.VideoCapture(video_path.as_posix())
    if not cap.isOpened():
        return [], 0.0

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total / fps if fps else 0.0

    sample_indices = [int(total * 0.1), int(total * 0.5), int(total * 0.85)]
    frames_b64: list[str] = []
    for idx in sample_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if not ret:
            continue
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        buf = io.BytesIO()
        Image.fromarray(rgb).save(buf, format="JPEG", quality=70)
        frames_b64.append(base64.b64encode(buf.getvalue()).decode())
    cap.release()
    return frames_b64, duration


async def tag_image_asset(image_path: Path) -> dict:
    """Tag a static image asset using GPT-4o-mini vision."""
    try:
        b64 = _encode_image_file(image_path)
        raw = await _vision_tag(
            [
                {"type": "text", "text": _TAGGING_PROMPT},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "low"},
                },
            ],
        )
        return _normalize_tags(raw)
    except Exception as exc:
        log.error("tag_image_failed", path=str(image_path), error=str(exc))
        return _fallback_tags(reason="Could not analyze this image. Try uploading again.")


async def tag_video_asset(video_path: Path, transcript_snippet: str = "") -> dict:
    """Tag a video asset by sampling 3 frames plus optional transcript snippet."""
    try:
        frames_b64, duration = _sample_video_frames(video_path)
        if not frames_b64:
            return _fallback_tags(
                duration_seconds=duration,
                has_audio=bool(transcript_snippet.strip()),
                reason="Could not read frames from this video.",
            )

        image_parts = [
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "low"},
            }
            for b64 in frames_b64
        ]
        prompt = _TAGGING_PROMPT
        if transcript_snippet.strip():
            prompt += f'\n\nFirst few spoken words (if any): "{transcript_snippet.strip()}"'

        raw = await _vision_tag(
            [{"type": "text", "text": prompt}, *image_parts],
        )
        return _normalize_tags(
            raw,
            duration_seconds=duration,
            has_audio=bool(transcript_snippet.strip()),
        )
    except Exception as exc:
        log.error("tag_video_failed", path=str(video_path), error=str(exc))
        return _fallback_tags(
            has_audio=bool(transcript_snippet.strip()),
            reason="Could not analyze this video. Try uploading again.",
        )
