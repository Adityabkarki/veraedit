"""
ViraEdit — DALL-E 3 image generator for B-roll.

Generates images using OpenAI's DALL-E 3 model, with Gemini 2.0 Flash
as an automatic fallback. Returns raw PNG bytes.

Costs (per image):
  - DALL-E 3 standard: $0.04 (1024x1024 / 1024x1792 / 1792x1024)
  - DALL-E 3 HD:       $0.08 (1024x1024 / 1024x1792 / 1792x1024)
  - Gemini fallback:   $0.04
"""

from __future__ import annotations

import io
import logging
from typing import Optional

import structlog

from config import settings

log = structlog.get_logger("viraedit.processors.dalle_generator")

_ASPECT_MAP: dict[str, str] = {
    "1:1":  "1024x1024",
    "16:9": "1792x1024",
    "9:16": "1024x1792",
}


def _dalle_generate(prompt: str, aspect: str = "16:9", quality: str = "standard") -> Optional[bytes]:
    if not settings.OPENAI_API_KEY:
        log.warning("dalle_skipped_no_key")
        return None

    size = _ASPECT_MAP.get(aspect, "1792x1024")
    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        resp = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size=size,
            quality=quality,
            style="vivid",
            n=1,
            response_format="b64_json",
        )
        b64 = resp.data[0].b64_json
        if b64:
            import base64
            return base64.b64decode(b64)
        log.warning("dalle_empty_response")
        return None
    except Exception as exc:
        log.warning("dalle_failed", error=str(exc))
        return None


def _gemini_fallback(prompt: str, aspect: str = "16:9") -> Optional[bytes]:
    """Fallback to Gemini 2.0 Flash image generation if DALL-E fails."""
    if not settings.GEMINI_API_KEY:
        log.warning("gemini_fallback_skipped_no_key")
        return None

    try:
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-2.0-flash-exp-image-generation")
        aspect_hint = {"1:1": "square", "16:9": "landscape", "9:16": "portrait"}.get(aspect, "landscape")
        full_prompt = f"{prompt}\n\nOrientation: {aspect_hint}. Generate a photorealistic image."
        response = model.generate_content(full_prompt)
        for part in response.parts:
            inline = getattr(part, "inline_data", None)
            if inline and inline.data:
                data = inline.data
                if isinstance(data, str):
                    import base64
                    return base64.b64decode(data)
                return bytes(data)
        log.warning("gemini_fallback_no_image_data")
        return None
    except Exception as exc:
        log.warning("gemini_fallback_failed", error=str(exc))
        return None


def generate_broll_image(
    prompt: str,
    aspect: str = "16:9",
    quality: str = "standard",
) -> tuple[Optional[bytes], str]:
    """
    Generate a B-roll image using DALL-E 3, falling back to Gemini.

    Args:
        prompt:  Text description of the image to generate.
        aspect:  Aspect ratio — "1:1", "16:9", or "9:16".
        quality: DALL-E quality — "standard" or "hd".

    Returns:
        (image_bytes | None, provider_name) where provider_name is
        "dall-e-3", "gemini", or "none".
    """
    # Primary: DALL-E 3
    data = _dalle_generate(prompt, aspect, quality)
    if data:
        return data, "dall-e-3"

    # Fallback: Gemini
    data = _gemini_fallback(prompt, aspect)
    if data:
        return data, "gemini"

    log.error("broll_image_generation_failed", prompt=prompt[:80])
    return None, "none"
