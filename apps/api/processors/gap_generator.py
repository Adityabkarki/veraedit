"""
ViraEdit — Generate missing template slot assets (Phase 02).

Uses Gemini image generation when configured; falls back to a labeled placeholder.
Video slots become Ken Burns stand-ins — always flagged as generated.
"""
from __future__ import annotations

import base64
import io
import tempfile
import uuid
from pathlib import Path
from typing import Any

import structlog
from PIL import Image, ImageDraw

from config import settings
from processors.imagegen import image_path_to_video
from processors.storage_helpers import storage_sync
from services.ai_budget import budget

log = structlog.get_logger("viraedit.gap_generator")

_IMAGE_GEN_COST_USD = 0.04
_GEMINI_IMAGE_MODEL = "gemini-2.0-flash-exp-image-generation"


def _placeholder_image(description: str, aspect_ratio: str) -> bytes:
    """Dev/fallback placeholder when Gemini image gen is unavailable."""
    width, height = (1080, 1920) if aspect_ratio == "9:16" else (1920, 1080)
    if aspect_ratio == "1:1":
        width = height = 1080

    img = Image.new("RGB", (width, height), color=(26, 26, 46))
    draw = ImageDraw.Draw(img)
    text = f"AI stand-in\n{description[:120]}"
    draw.multiline_text((40, height // 3), text, fill=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def generate_missing_image(
    requirement_description: str,
    brand_context: dict[str, Any],
    aspect_ratio: str = "9:16",
) -> bytes:
    """Generate a still image for a missing slot."""
    if settings.GEMINI_API_KEY:
        try:
            import google.generativeai as genai

            genai.configure(api_key=settings.GEMINI_API_KEY)
            model = genai.GenerativeModel(_GEMINI_IMAGE_MODEL)
            colors = brand_context.get("colors") or []
            prompt = (
                f"{requirement_description}. "
                f"Style: {brand_context.get('visual_style', 'professional, clean')}. "
                f"Color palette to incorporate subtly: {colors}. "
                f"High quality, suitable for a {aspect_ratio} social media video frame."
            )
            response = model.generate_content(prompt)
            budget.record(_IMAGE_GEN_COST_USD, task="gap_generate_image")

            for part in response.parts:
                inline = getattr(part, "inline_data", None)
                if inline and inline.data:
                    data = inline.data
                    if isinstance(data, str):
                        return base64.b64decode(data)
                    return bytes(data)
        except Exception as exc:
            log.warning("gemini_image_gen_failed", error=str(exc))

    log.info("gap_image_placeholder_used", description=requirement_description[:80])
    return _placeholder_image(requirement_description, aspect_ratio)


async def generate_missing_video_concept(
    requirement_description: str,
    brand_context: dict[str, Any],
    *,
    aspect_ratio: str = "9:16",
    user_id: str,
) -> dict[str, Any]:
    """
    Generate image + Ken Burns video stand-in for a missing video slot.
    """
    image_bytes = await generate_missing_image(
        requirement_description, brand_context, aspect_ratio
    )
    asset_id = str(uuid.uuid4())
    temp_dir = Path(tempfile.gettempdir()) / "viraedit" / "gap" / asset_id
    temp_dir.mkdir(parents=True, exist_ok=True)

    img_path = temp_dir / "frame.png"
    video_path = temp_dir / "clip.mp4"
    img_path.write_bytes(image_bytes)

    img_key = f"users/{user_id}/library/generated/{asset_id}.png"
    storage_sync.put_object(img_key, image_bytes, "image/png")

    image_path_to_video(
        img_path,
        video_path,
        duration=4.0,
        aspect_ratio=aspect_ratio,
        animation="ken_burns",
    )

    video_key = f"users/{user_id}/library/generated/{asset_id}.mp4"
    storage_sync.put_file(video_key, video_path, "video/mp4")

    for path in (img_path, video_path):
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass

    return {
        "asset_id": asset_id,
        "video_key": video_key,
        "thumb_key": img_key,
        "is_generated_standin": True,
    }
