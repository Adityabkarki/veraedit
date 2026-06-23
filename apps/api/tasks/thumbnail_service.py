"""
ViraEdit — Thumbnail generation (frame extract + AI layout overlay).

Uploads rendered JPEGs to MinIO temp bucket and returns storage keys / URLs.
"""
from __future__ import annotations

import logging
import pathlib
import subprocess
import tempfile
import uuid
from typing import Any, Optional

from config import settings

log = logging.getLogger("viraedit.tasks.thumbnail_service")

BUCKET = "viraedit-temp"


def _s3_client():
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="us-east-1",
    )


def _extract_frame(video_path: pathlib.Path, timestamp_s: float, out_path: pathlib.Path) -> bool:
    cmd = [
        settings.FFMPEG_PATH,
        "-y",
        "-ss",
        str(max(0.0, timestamp_s)),
        "-i",
        video_path.as_posix(),
        "-frames:v",
        "1",
        "-q:v",
        "2",
        out_path.as_posix(),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=120)
        return out_path.is_file()
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as exc:
        log.warning("thumbnail_frame_extract_failed", error=str(exc))
        return False


def _pick_timestamp(item: dict) -> float:
    start = float(item.get("start_time", 0))
    end = float(item.get("end_time", start))
    return start + (end - start) * 0.35


def _layout_from_llm(title: str, summary: str, brand: dict[str, str]) -> dict[str, Any]:
    try:
        from tasks.ai_client import generate_thumbnail_layout
        from tasks.model_router import BudgetState

        result = generate_thumbnail_layout(
            title=title,
            summary=summary,
            primary_color=brand.get("primary", "#1E3A5F"),
            accent_color=brand.get("accent", "#C41E3A"),
            budget=BudgetState(),
        )
        return result.content
    except Exception as exc:
        log.warning("thumbnail_layout_llm_failed: %s", exc)
        return {
            "headline": (title or "Episode")[:40],
            "subline": "",
            "headline_color": "#FFFFFF",
            "accent_bar_color": brand.get("accent", "#C41E3A"),
            "position": "bottom",
        }


def _render_overlay(frame_path: pathlib.Path, layout: dict[str, Any], out_path: pathlib.Path) -> bool:
    try:
        from PIL import Image, ImageDraw, ImageFont

        img = Image.open(frame_path).convert("RGB")
        draw = ImageDraw.Draw(img)
        w, h = img.size
        headline = str(layout.get("headline", ""))[:60]
        subline = str(layout.get("subline", ""))[:80]
        bar_color = layout.get("accent_bar_color", "#C41E3A")
        text_color = layout.get("headline_color", "#FFFFFF")

        bar_h = max(80, h // 5)
        draw.rectangle([0, h - bar_h, w, h], fill=bar_color)
        try:
            font_lg = ImageFont.truetype("arial.ttf", max(18, bar_h // 4))
            font_sm = ImageFont.truetype("arial.ttf", max(12, bar_h // 6))
        except OSError:
            font_lg = ImageFont.load_default()
            font_sm = font_lg

        y = h - bar_h + 12
        draw.text((16, y), headline, fill=text_color, font=font_lg)
        if subline:
            draw.text((16, y + bar_h // 3), subline, fill=text_color, font=font_sm)

        img.save(out_path, "JPEG", quality=88)
        return True
    except Exception as exc:
        log.warning("thumbnail_render_failed: %s", exc)
        return False


def generate_thumbnail_for_item(
    *,
    video_path: pathlib.Path,
    project_id: str,
    asset_id: str,
    item_id: str,
    item: dict,
    brand: Optional[dict[str, str]] = None,
) -> Optional[str]:
    """
    Extract frame, apply layout, upload to MinIO.

    Returns storage key (path) or None.
    """
    brand = brand or {"primary": "#1E3A5F", "accent": "#C41E3A"}
    ts = _pick_timestamp(item)
    title = str(item.get("title") or item.get("summary") or "Chapter")
    summary = str(item.get("summary") or "")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = pathlib.Path(tmp)
        frame = tmp_path / "frame.jpg"
        final = tmp_path / "thumb.jpg"

        if not _extract_frame(video_path, ts, frame):
            return None

        layout = _layout_from_llm(title, summary, brand)
        if not _render_overlay(frame, layout, final):
            final = frame

        key = f"thumbnails/{project_id}/{asset_id}/{item_id}_{uuid.uuid4().hex[:8]}.jpg"
        try:
            _s3_client().upload_file(
                Filename=str(final),
                Bucket=BUCKET,
                Key=key,
                ExtraArgs={"ContentType": "image/jpeg"},
            )
            return key
        except Exception as exc:
            log.warning("thumbnail_upload_failed", error=str(exc))
            return None


def thumbnail_public_url(storage_key: str) -> str:
    """Build API-relative or presigned path for frontend (proxy via media URL if needed)."""
    base = (settings.S3_ENDPOINT_URL or "").rstrip("/")
    return f"{base}/{BUCKET}/{storage_key}"
