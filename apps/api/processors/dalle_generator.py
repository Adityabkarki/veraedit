"""
ViraEdit — AI image generator for B-roll.

Tries OpenAI image models (DALL-E 3 → DALL-E 2), then Gemini image models.
Returns raw image bytes.
"""

from __future__ import annotations

from typing import Optional

import httpx
import structlog

from config import settings
from processors.gemini_image import generate_gemini_image

log = structlog.get_logger("viraedit.processors.dalle_generator")

_ASPECT_MAP_DALLE3: dict[str, str] = {
    "1:1": "1024x1024",
    "16:9": "1792x1024",
    "9:16": "1024x1792",
}

_DALLE2_SIZE = "1024x1024"

# Set after OpenAI returns "model does not exist" — chat-only keys lack Images API.
_openai_images_unavailable = False


def reset_openai_image_cache_for_tests() -> None:
    global _openai_images_unavailable
    _openai_images_unavailable = False


def _download_image_url(url: str) -> Optional[bytes]:
    try:
        img_resp = httpx.get(url, timeout=60)
        img_resp.raise_for_status()
        return img_resp.content
    except Exception as exc:
        log.warning("dalle_image_download_failed", error=str(exc))
        return None


def _openai_generate(
    prompt: str,
    model: str,
    *,
    aspect: str,
    quality: str,
) -> Optional[bytes]:
    if not settings.OPENAI_API_KEY:
        return None

    is_dalle3 = model.startswith("dall-e-3")
    size = _ASPECT_MAP_DALLE3.get(aspect, "1792x1024") if is_dalle3 else _DALLE2_SIZE

    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        kwargs: dict = {
            "model": model,
            "prompt": prompt,
            "size": size,
            "n": 1,
        }
        if is_dalle3:
            kwargs["quality"] = quality

        resp = client.images.generate(**kwargs)
        item = resp.data[0]
        if item.url:
            return _download_image_url(item.url)
        if getattr(item, "b64_json", None):
            import base64
            return base64.b64decode(item.b64_json)
        log.warning("dalle_empty_response", model=model)
        return None
    except Exception as exc:
        global _openai_images_unavailable
        err = str(exc)
        if "does not exist" in err.lower() or "invalid_value" in err.lower():
            _openai_images_unavailable = True
            log.info(
                "openai_images_unavailable",
                model=model,
                hint="Set OPENAI_IMAGE_ENABLED=false to skip Images API on chat-only keys.",
            )
            return None
        log.warning("dalle_model_failed", model=model, error=err)
        return None


def _dalle_generate(prompt: str, aspect: str = "16:9", quality: str = "standard") -> tuple[Optional[bytes], str]:
    global _openai_images_unavailable

    if not settings.OPENAI_API_KEY:
        log.debug("dalle_skipped_no_key")
        return None, "none"
    if not settings.OPENAI_IMAGE_ENABLED:
        log.debug("dalle_skipped_disabled")
        return None, "none"
    if _openai_images_unavailable:
        log.debug("dalle_skipped_cached_unavailable")
        return None, "none"

    primary = (settings.OPENAI_IMAGE_MODEL or "dall-e-3").strip()
    models = [primary]
    if primary != "dall-e-3":
        models.append("dall-e-3")
    if "dall-e-2" not in models:
        models.append("dall-e-2")

    for model in models:
        data = _openai_generate(prompt, model, aspect=aspect, quality=quality)
        if data:
            return data, model

    return None, "none"


def generate_broll_image(
    prompt: str,
    aspect: str = "16:9",
    quality: str = "standard",
) -> tuple[Optional[bytes], str]:
    """
    Generate a B-roll image using OpenAI, then Gemini image models.

    Returns:
        (image_bytes | None, provider_name)
    """
    data, provider = _dalle_generate(prompt, aspect, quality)
    if data:
        return data, provider

    data, gemini_model = generate_gemini_image(prompt, aspect)
    if data:
        return data, gemini_model

    log.info("broll_image_generation_unavailable", prompt=prompt[:80])
    return None, "none"
