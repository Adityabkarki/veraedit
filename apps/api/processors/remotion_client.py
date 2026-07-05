"""
ViraEdit — Remotion render service HTTP client (Phase 09).

Calls the internal Node.js Remotion service for animated caption/title overlays,
then composites via FFmpeg. Port 3500 must NOT be exposed publicly.
"""
from __future__ import annotations

import logging
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Any

import httpx

from config import settings

log = logging.getLogger("viraedit.processors.remotion_client")

FONT_BY_STYLE: dict[str, str] = {
    "hormozi": "Montserrat",
    "mrbeast": "Bangers",
    "minimal": "Inter",
    "nepali_bold": "Noto Sans Devanagari",
    "kinetic": "Montserrat",
}


def _temp_overlay_path(prefix: str, suffix: str = ".webm") -> Path:
    out_dir = Path(tempfile.gettempdir()) / "viraedit" / "remotion"
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / f"{prefix}_{uuid.uuid4().hex[:8]}{suffix}"


async def render_caption_overlay(
    words: list[dict[str, Any]],
    style: str,
    duration: float,
    *,
    width: int = 1080,
    height: int = 1920,
    font_family: str | None = None,
    fps: int = 30,
) -> str:
    """
    Render a transparent WebM overlay with animated captions only.
    Returns local path to the overlay file.
    """
    output_path = _temp_overlay_path("caption_overlay")
    family = font_family or FONT_BY_STYLE.get(style, "Montserrat")
    payload = {
        "words": words,
        "style": style,
        "fontFamily": family,
        "durationSeconds": duration,
        "width": width,
        "height": height,
        "outputPath": output_path.as_posix(),
        "fps": fps,
    }

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(
            connect=5.0,
            read=settings.REMOTION_RENDER_TIMEOUT,
            write=30.0,
            pool=5.0,
        )
    ) as client:
        resp = await client.post(
            f"{settings.REMOTION_SERVICE_URL.rstrip('/')}/render-captions",
            json=payload,
        )
        resp.raise_for_status()
        result = resp.json()
        if not result.get("success"):
            raise RuntimeError(
                f"Remotion caption render failed: {result.get('error', 'unknown error')}"
            )

    if not output_path.exists():
        raise RuntimeError("Remotion reported success but overlay file was not created")

    return output_path.as_posix()


async def render_title_card_overlay(
    text: str,
    start: float,
    end: float,
    total_duration: float,
    *,
    brand_color: str = "#3b82f6",
    width: int = 1080,
    height: int = 1920,
    font_family: str = "Montserrat",
    fps: int = 30,
) -> str:
    """Render a transparent WebM title-card overlay."""
    output_path = _temp_overlay_path("title_overlay")
    payload = {
        "text": text,
        "startSeconds": start,
        "endSeconds": end,
        "fontFamily": font_family,
        "brandColor": brand_color,
        "durationSeconds": total_duration,
        "width": width,
        "height": height,
        "outputPath": output_path.as_posix(),
        "fps": fps,
    }

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(
            connect=5.0,
            read=settings.REMOTION_RENDER_TIMEOUT,
            write=30.0,
            pool=5.0,
        )
    ) as client:
        resp = await client.post(
            f"{settings.REMOTION_SERVICE_URL.rstrip('/')}/render-title-card",
            json=payload,
        )
        resp.raise_for_status()
        result = resp.json()
        if not result.get("success"):
            raise RuntimeError(
                f"Remotion title card render failed: {result.get('error', 'unknown error')}"
            )

    if not output_path.exists():
        raise RuntimeError("Remotion reported success but title overlay was not created")

    return output_path.as_posix()


async def render_lower_third_overlay(
    text: str,
    start_seconds: float,
    end_seconds: float,
    total_duration: float,
    *,
    brand_color: str = "#3b82f6",
    width: int = 1080,
    height: int = 1920,
    font_family: str = "Montserrat",
    animation: str = "slide_up",
    subtext: str | None = None,
    fps: int = 30,
) -> str:
    """Render a transparent WebM lower-third overlay."""
    output_path = _temp_overlay_path("lower_third_overlay")
    payload = {
        "text": text,
        "subtext": subtext,
        "startSeconds": start_seconds,
        "endSeconds": end_seconds,
        "fontFamily": font_family,
        "brandColor": brand_color,
        "animation": animation,
        "durationSeconds": total_duration,
        "width": width,
        "height": height,
        "outputPath": output_path.as_posix(),
        "fps": fps,
    }

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(
            connect=5.0,
            read=settings.REMOTION_RENDER_TIMEOUT,
            write=30.0,
            pool=5.0,
        )
    ) as client:
        resp = await client.post(
            f"{settings.REMOTION_SERVICE_URL.rstrip('/')}/render-lower-third",
            json=payload,
        )
        resp.raise_for_status()
        result = resp.json()
        if not result.get("success"):
            raise RuntimeError(
                f"Remotion lower-third render failed: {result.get('error', 'unknown error')}"
            )

    if not output_path.exists():
        raise RuntimeError("Remotion reported success but lower-third overlay was not created")

    return output_path.as_posix()


def composite_overlay_onto_video(
    base_video_path: str | Path,
    overlay_path: str | Path,
    output_path: str | Path,
) -> str:
    """
    Overlay transparent Remotion WebM onto base footage via FFmpeg.
    FFmpeg owns final assembly; Remotion only produced the text layer.
    """
    base = Path(base_video_path)
    overlay = Path(overlay_path)
    out = Path(output_path)

    subprocess.run(
        [
            settings.FFMPEG_PATH,
            "-i",
            base.as_posix(),
            "-i",
            overlay.as_posix(),
            "-filter_complex",
            "[0:v][1:v]overlay=0:0:format=auto",
            "-c:a",
            "copy",
            out.as_posix(),
            "-y",
        ],
        check=True,
        capture_output=True,
    )
    return out.as_posix()


async def render_motion_graphics_overlay(
    plan: dict[str, Any],
    duration: float,
    *,
    width: int = 1080,
    height: int = 1920,
    fps: int = 30,
) -> str:
    """
    Render a transparent WebM overlay containing all motion graphic elements
    from a validated motion plan. Returns local path to the overlay file.
    """
    output_path = _temp_overlay_path("motion_graphics_overlay")
    payload = {
        "plan": plan,
        "durationSeconds": duration,
        "width": width,
        "height": height,
        "outputPath": output_path.as_posix(),
        "fps": fps,
    }

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(
            connect=5.0,
            read=settings.REMOTION_RENDER_TIMEOUT,
            write=60.0,
            pool=5.0,
        )
    ) as client:
        resp = await client.post(
            f"{settings.REMOTION_SERVICE_URL.rstrip('/')}/render-motion-graphics",
            json=payload,
        )
        resp.raise_for_status()
        result = resp.json()
        if not result.get("success"):
            raise RuntimeError(
                f"Remotion motion graphics render failed: {result.get('error', 'unknown error')}"
            )

    if not output_path.exists():
        raise RuntimeError("Remotion reported success but motion overlay was not created")

    return output_path.as_posix()


async def remotion_service_healthy() -> bool:
    """Return True if the Remotion render service responds to /health."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.REMOTION_SERVICE_URL.rstrip('/')}/health")
            return resp.status_code == 200 and resp.json().get("ok") is True
    except Exception:
        return False


async def compile_director_timeline(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Call remotion-service POST /director/compile → runDirector() → DirectorTimeline.
    """
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(
            connect=5.0,
            read=120.0,
            write=30.0,
            pool=5.0,
        )
    ) as client:
        resp = await client.post(
            f"{settings.REMOTION_SERVICE_URL.rstrip('/')}/director/compile",
            json=payload,
        )
        resp.raise_for_status()
        result = resp.json()
        if not result.get("success"):
            raise RuntimeError(
                f"Director compile failed: {result.get('error', 'unknown error')}"
            )
        timeline = result.get("timeline")
        if not isinstance(timeline, dict):
            raise RuntimeError("Director compile returned no timeline payload.")
        return timeline


async def render_director_export(
    timeline: dict[str, Any],
    *,
    output_path: str,
    asset_urls: dict[str, str] | None = None,
    primary_video_src: str | None = None,
    dialogue_src: str | None = None,
    camera_feeds: list[dict[str, Any]] | None = None,
    sfx_urls: dict[str, str] | None = None,
    font_family: str = "Montserrat",
) -> str:
    """Render a full Director timeline via remotion-service POST /render-director."""
    payload = {
        "timeline": timeline,
        "assetUrls": asset_urls or {},
        "primaryVideoSrc": primary_video_src,
        "dialogueSrc": dialogue_src,
        "cameraFeeds": camera_feeds or [],
        "sfxUrls": sfx_urls or {},
        "fontFamily": font_family,
        "outputPath": output_path,
        "fps": timeline.get("fps", 30),
        "width": timeline.get("width"),
        "height": timeline.get("height"),
    }

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(
            connect=5.0,
            read=settings.REMOTION_RENDER_TIMEOUT,
            write=60.0,
            pool=5.0,
        )
    ) as client:
        resp = await client.post(
            f"{settings.REMOTION_SERVICE_URL.rstrip('/')}/render-director",
            json=payload,
        )
        resp.raise_for_status()
        result = resp.json()
        if not result.get("success"):
            raise RuntimeError(
                f"Director render failed: {result.get('error', 'unknown error')}"
            )

    out = Path(output_path)
    if not out.exists():
        raise RuntimeError("Director render reported success but output file was not created")
    return out.as_posix()
