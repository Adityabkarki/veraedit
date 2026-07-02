"""
Gemini native image generation (Nano Banana models).

gemini-2.0-flash does NOT generate images — use image-capable model IDs only.
"""

from __future__ import annotations

import base64
from typing import Optional

import httpx
import structlog

from config import settings

log = structlog.get_logger("viraedit.processors.gemini_image")

_DEFAULT_IMAGE_MODELS = (
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-image",
    "gemini-2.0-flash-preview-image-generation",
)


def gemini_image_model_candidates() -> list[str]:
    """Ordered list of Gemini image models to try."""
    configured = (settings.GEMINI_IMAGE_MODEL or "").strip()
    models: list[str] = []
    if configured:
        models.append(configured)
    for model in _DEFAULT_IMAGE_MODELS:
        if model not in models:
            models.append(model)
    return models


def generate_gemini_image(prompt: str, aspect: str = "16:9") -> tuple[Optional[bytes], str]:
    """
    Generate an image with Gemini image-capable models.

    Returns (png_bytes | None, model_name_or_none).
    """
    if not settings.GEMINI_API_KEY:
        log.warning("gemini_image_skipped_no_key")
        return None, "none"

    aspect_hint = {"1:1": "square", "16:9": "landscape", "9:16": "portrait"}.get(
        aspect, "landscape"
    )
    full_prompt = (
        f"{prompt}\n\n"
        f"Orientation: {aspect_hint}. Generate a single photorealistic image."
    )

    for model in gemini_image_model_candidates():
        data = _generate_with_model(model, full_prompt)
        if data:
            return data, model

    log.warning("gemini_image_all_models_failed", prompt=prompt[:80])
    return None, "none"


def _generate_with_model(model: str, prompt: str) -> Optional[bytes]:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/"
        f"models/{model}:generateContent"
        f"?key={settings.GEMINI_API_KEY}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
        },
    }
    try:
        resp = httpx.post(url, json=payload, timeout=90)
        if resp.status_code == 400:
            body = resp.text[:300]
            log.warning("gemini_image_model_rejected", model=model, body=body)
            return None
        resp.raise_for_status()
        data = resp.json()

        for candidate in data.get("candidates", []):
            for part in candidate.get("content", {}).get("parts", []):
                inline_data = part.get("inlineData")
                if inline_data and inline_data.get("data"):
                    return base64.b64decode(inline_data["data"])

        log.warning("gemini_image_no_inline_data", model=model)
        return None
    except Exception as exc:
        log.warning("gemini_image_model_failed", model=model, error=str(exc))
        return None
