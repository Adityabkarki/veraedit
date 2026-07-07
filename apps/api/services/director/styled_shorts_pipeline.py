"""
Production Director-styled Short/Sizzle pipeline — Phase 11.

Single orchestration module used by render tasks, platform extract, and sizzle.
"""
from __future__ import annotations

import subprocess
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import structlog

from config import settings
from processors.remotion_client import (
    PLATFORM_RENDER_VARIANTS,
    platform_to_render_variant_key,
)
from processors.reframer import REFRAME_WARNING_MESSAGES, reframe_video
from services.brand_theme_service import brand_kit_to_theme
from services.director.extract_signals import extract_director_signals
from services.director.transcript_segments import words_to_segments

log = structlog.get_logger("viraedit.director.styled_shorts_pipeline")

SOCIAL_TARGET = "social"
DEFAULT_FPS = 30.0
SHORT_WIDTH = 1080
SHORT_HEIGHT = 1920

# Map platform_shorts / render platform strings → variant keys
PLATFORM_ALIAS: dict[str, str] = {
    "tiktok": "tiktok",
    "instagram": "instagram",
    "instagram_reels": "instagram",
    "youtube": "youtube",
    "youtube_shorts": "youtube",
    "linkedin": "linkedin",
    "facebook": "tiktok",
    "facebook_reels": "instagram",
    "facebook_feed": "linkedin",
}

MIN_PLATFORM_SCORE = 5.0


@dataclass
class StyledShortContext:
    project_id: str
    theme: dict[str, Any]
    parent_timeline: dict[str, Any] | None
    signals: dict[str, Any] | None
    asset_urls: dict[str, str] = field(default_factory=dict)
    primary_asset_id: str | None = None


@dataclass
class ReframedClip:
    local_path: Path
    storage_key: str
    presigned_url: str
    reframed_asset_id: str
    warning: str | None = None
    pan_x: float = 0.5


@dataclass
class PlatformRenderOutput:
    platform: str
    storage_key: str
    duration_seconds: float
    variant_key: str


def _sync_db_url() -> str:
    return settings.DATABASE_URL.replace("postgresql+asyncpg://", "")


def platforms_from_scores(platform_scores: dict[str, Any] | None) -> list[str]:
    """
    Derive target platforms from shorts.platform_scores JSONB.
    Scores-only keys (youtube, tiktok, etc.) — ignores editorial metadata keys.
    """
    if not platform_scores:
        return ["tiktok", "instagram_reels", "youtube_shorts"]

    score_keys = ("youtube", "tiktok", "instagram", "linkedin", "facebook")
    ranked: list[tuple[str, float]] = []
    for key in score_keys:
        val = platform_scores.get(key)
        if isinstance(val, (int, float)) and val >= MIN_PLATFORM_SCORE:
            api_platform = {
                "youtube": "youtube_shorts",
                "instagram": "instagram_reels",
                "facebook": "facebook_reels",
            }.get(key, key)
            ranked.append((api_platform, float(val)))

    ranked.sort(key=lambda x: x[1], reverse=True)
    if not ranked:
        return ["tiktok"]
    return [p for p, _ in ranked]


def resolve_theme_from_settings(settings_data: dict[str, Any], project_name: str) -> dict[str, Any]:
    brand_kit = settings_data.get("brand_kit") or settings_data.get("brandKit")
    if isinstance(brand_kit, dict) and brand_kit:
        return brand_kit_to_theme(brand_kit)
    return brand_kit_to_theme(
        {
            "primaryColor": "#C41E3A",
            "secondaryColor": "#111113",
            "accentColor": "#F59E0B",
            "fontStyle": "nepali",
            "logoText": project_name or "ViraEdit",
        }
    )


def load_styled_short_context_sync(
    project_id: str,
    *,
    asset_id: str | None = None,
) -> StyledShortContext:
    """Load parent timeline, signals, theme, and asset URLs for a project."""
    from sqlalchemy import create_engine, text

    engine = create_engine(_sync_db_url(), pool_pre_ping=True)
    parent_timeline = None
    signals = None
    theme: dict[str, Any] | None = None
    asset_urls: dict[str, str] = {}
    primary_asset_id = asset_id
    project_name = "ViraEdit"

    with engine.connect() as conn:
        parent_row = conn.execute(
            text(
                """
                SELECT data FROM director_timelines
                WHERE project_id = :pid AND is_active = true
                ORDER BY version DESC LIMIT 1
                """
            ),
            {"pid": project_id},
        ).fetchone()
        if parent_row and parent_row.data:
            parent_timeline = parent_row.data

        project_row = conn.execute(
            text("SELECT name, settings FROM projects WHERE id = :id"),
            {"id": project_id},
        ).fetchone()
        if project_row:
            project_name = project_row.name or project_name
            theme = resolve_theme_from_settings(project_row.settings or {}, project_name)

        transcript_row = conn.execute(
            text(
                """
                SELECT words, duration FROM transcripts
                WHERE project_id = :pid
                ORDER BY created_at DESC LIMIT 1
                """
            ),
            {"pid": project_id},
        ).fetchone()
        if transcript_row and transcript_row.words:
            segments = words_to_segments(transcript_row.words)
            signals = extract_director_signals(
                segments=segments,
                words=transcript_row.words,
                duration_seconds=float(transcript_row.duration or 0),
            )

        asset_rows = conn.execute(
            text(
                """
                SELECT id, storage_key, original_filename
                FROM assets WHERE project_id = :pid ORDER BY created_at ASC
                """
            ),
            {"pid": project_id},
        ).fetchall()

    from processors.storage_helpers import S3Storage

    storage = S3Storage()
    for row in asset_rows:
        url = storage.get_presigned_url(row.storage_key, filename=row.original_filename)
        asset_urls[str(row.id)] = url
        if primary_asset_id is None:
            primary_asset_id = str(row.id)

    if theme is None:
        theme = resolve_theme_from_settings({}, project_name)

    return StyledShortContext(
        project_id=project_id,
        theme=theme,
        parent_timeline=parent_timeline,
        signals=signals,
        asset_urls=asset_urls,
        primary_asset_id=primary_asset_id,
    )


def _download_asset_sync(asset_id: str, dest: Path) -> Path:
    from sqlalchemy import create_engine, text
    from processors.storage_helpers import S3Storage

    engine = create_engine(_sync_db_url(), pool_pre_ping=True)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT storage_key FROM assets WHERE id = :id"),
            {"id": asset_id},
        ).fetchone()
    if not row:
        raise RuntimeError(f"Asset {asset_id} not found.")

    storage = S3Storage()
    dest.parent.mkdir(parents=True, exist_ok=True)
    storage.client.download_file(storage.bucket, row.storage_key, dest.as_posix())
    return dest


def trim_and_reframe_clip_sync(
    *,
    asset_id: str,
    start_time: float,
    end_time: float,
    work_dir: Path,
    upload_prefix: str,
) -> ReframedClip:
    """
    Trim source to clip window, reframe to 9:16 (face-track with center fallback).
    Uploads reframed clip to temp storage for DirectorRender primaryVideoSrc.
    """
    from processors.storage_helpers import S3Storage

    work_dir.mkdir(parents=True, exist_ok=True)
    trimmed = work_dir / "trimmed.mp4"
    reframed = work_dir / "reframed_9x16.mp4"

    src = _download_asset_sync(asset_id, work_dir / "source.mp4")
    subprocess.run(
        [
            settings.FFMPEG_PATH,
            "-y",
            "-ss",
            str(start_time),
            "-to",
            str(end_time),
            "-i",
            src.as_posix(),
            "-c:v",
            "libx264",
            "-crf",
            "20",
            "-preset",
            "veryfast",
            "-c:a",
            "aac",
            "-ar",
            "48000",
            trimmed.as_posix(),
        ],
        check=True,
        capture_output=True,
    )

    _, warning = reframe_video(
        trimmed,
        reframed,
        SHORT_WIDTH,
        SHORT_HEIGHT,
        mode="face_track",
    )

    reframed_id = f"reframed-{uuid.uuid4().hex[:12]}"
    storage_key = f"{upload_prefix}/{reframed_id}.mp4"
    storage = S3Storage()
    storage.put_file(storage_key, reframed, content_type="video/mp4")
    url = storage.get_presigned_url(storage_key, filename="reframed_short.mp4")

    if warning:
        log.info(
            "styled_short_reframe_warning",
            asset_id=asset_id,
            warning=warning,
            message=REFRAME_WARNING_MESSAGES.get(warning, warning),
        )

    return ReframedClip(
        local_path=reframed,
        storage_key=storage_key,
        presigned_url=url,
        reframed_asset_id=reframed_id,
        warning=warning,
    )


def build_prepare_payload(
    ctx: StyledShortContext,
    *,
    start_time: float,
    end_time: float,
    hook: str | None = None,
    viral_score: float | None = None,
    reframed: ReframedClip | None = None,
    base_only: bool = True,
) -> dict[str, Any]:
    """Build remotion POST /director/prepare-styled-short payload."""
    start_frame = max(0, int(round(start_time * DEFAULT_FPS)))
    end_frame = max(start_frame + 1, int(round(end_time * DEFAULT_FPS)))

    hook_phrase = None
    if hook:
        hook_phrase = {
            "text": hook,
            "confidence": min(1.0, (viral_score or 7.0) / 10.0),
            "start": start_time,
            "end": min(end_time, start_time + 3.5),
            "confidenceSource": "ml",
        }

    payload: dict[str, Any] = {
        "parentTimeline": ctx.parent_timeline,
        "startFrame": start_frame,
        "endFrame": end_frame,
        "targetContentType": SOCIAL_TARGET,
        "projectId": ctx.project_id,
        "fps": DEFAULT_FPS,
        "width": SHORT_WIDTH,
        "height": SHORT_HEIGHT,
        "theme": ctx.theme,
        "signals": ctx.signals,
        "hookPhrase": hook_phrase,
        "sourceAssetId": ctx.primary_asset_id,
        "reframedSourceAssetId": reframed.reframed_asset_id if reframed else None,
        "reframeWarning": reframed.warning if reframed else None,
        "panX": reframed.pan_x if reframed else 0.5,
        "baseOnly": base_only,
    }
    return payload


def prepare_styled_short_timeline_sync(payload: dict[str, Any]) -> dict[str, Any]:
    """Call remotion-service to compile base timeline (no platform variant)."""
    resp = httpx.post(
        f"{settings.REMOTION_SERVICE_URL.rstrip('/')}/director/prepare-styled-short",
        json=payload,
        timeout=120.0,
    )
    resp.raise_for_status()
    result = resp.json()
    if not result.get("success"):
        raise RuntimeError(result.get("error", "Styled short timeline preparation failed."))
    timeline = result.get("timeline")
    if not isinstance(timeline, dict):
        raise RuntimeError("Styled short preparation returned no timeline.")
    return timeline


def render_director_timeline_sync(
    timeline: dict[str, Any],
    *,
    output_path: str,
    asset_urls: dict[str, str],
    primary_video_src: str,
    platform: str,
) -> str:
    """Render one platform variant via POST /render-director."""
    variant_key = platform_to_render_variant_key(platform)
    variant = PLATFORM_RENDER_VARIANTS.get(variant_key, PLATFORM_RENDER_VARIANTS["tiktok"])

    payload = {
        "timeline": timeline,
        "assetUrls": asset_urls,
        "primaryVideoSrc": primary_video_src,
        "dialogueSrc": primary_video_src,
        "platformVariant": variant,
        "outputPath": output_path,
        "fps": timeline.get("fps", DEFAULT_FPS),
        "width": timeline.get("width", SHORT_WIDTH),
        "height": timeline.get("height", SHORT_HEIGHT),
    }

    resp = httpx.post(
        f"{settings.REMOTION_SERVICE_URL.rstrip('/')}/render-director",
        json=payload,
        timeout=float(settings.REMOTION_RENDER_TIMEOUT),
    )
    resp.raise_for_status()
    result = resp.json()
    if not result.get("success"):
        raise RuntimeError(result.get("error", "Director render failed."))
    return output_path


def _upload_render_file(local_path: Path, storage_key: str) -> None:
    """Upload finished render to viraedit-renders bucket."""
    import boto3
    from botocore.config import Config

    client = boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        region_name=settings.S3_REGION,
    )
    client.upload_file(
        local_path.as_posix(),
        settings.S3_BUCKET_RENDERS,
        storage_key,
        ExtraArgs={"ContentType": "video/mp4"},
    )


def render_multi_platform_variants_sync(
    base_timeline: dict[str, Any],
    platforms: list[str],
    *,
    asset_urls: dict[str, str],
    primary_video_src: str,
    upload_prefix: str,
    ffprobe_duration,
) -> list[PlatformRenderOutput]:
    """One compiled timeline → N platform renders (Platform Variant Law)."""
    outputs: list[PlatformRenderOutput] = []

    with tempfile.TemporaryDirectory(prefix="viraedit_multi_platform_") as tmp:
        tmp_dir = Path(tmp)
        for platform in platforms:
            variant_key = platform_to_render_variant_key(platform)
            out_local = tmp_dir / f"{platform.replace('/', '_')}.mp4"
            render_director_timeline_sync(
                base_timeline,
                output_path=out_local.as_posix(),
                asset_urls=asset_urls,
                primary_video_src=primary_video_src,
                platform=platform,
            )
            duration = ffprobe_duration(out_local)
            storage_key = f"{upload_prefix}/{platform}/{uuid.uuid4().hex[:8]}.mp4"
            _upload_render_file(out_local, storage_key)
            outputs.append(
                PlatformRenderOutput(
                    platform=platform,
                    storage_key=storage_key,
                    duration_seconds=duration,
                    variant_key=variant_key,
                )
            )
            log.info(
                "director_styled_platform_render_ok",
                platform=platform,
                variant=variant_key,
                storage_key=storage_key,
            )

    return outputs


def run_styled_short_pipeline_sync(
    *,
    project_id: str,
    asset_id: str,
    start_time: float,
    end_time: float,
    platforms: list[str],
    hook: str | None = None,
    viral_score: float | None = None,
    upload_prefix: str,
    ffprobe_duration,
) -> tuple[dict[str, Any], list[PlatformRenderOutput], ReframedClip]:
    """
    Full production pipeline: context → reframe → compile once → render per platform.
    """
    ctx = load_styled_short_context_sync(project_id, asset_id=asset_id)
    ctx.primary_asset_id = asset_id

    with tempfile.TemporaryDirectory(prefix="viraedit_styled_short_") as tmp:
        work_dir = Path(tmp)
        reframed = trim_and_reframe_clip_sync(
            asset_id=asset_id,
            start_time=start_time,
            end_time=end_time,
            work_dir=work_dir,
            upload_prefix=f"temp/reframed/{project_id}",
        )

        asset_urls = dict(ctx.asset_urls)
        asset_urls[reframed.reframed_asset_id] = reframed.presigned_url

        payload = build_prepare_payload(
            ctx,
            start_time=start_time,
            end_time=end_time,
            hook=hook,
            viral_score=viral_score,
            reframed=reframed,
            base_only=True,
        )
        base_timeline = prepare_styled_short_timeline_sync(payload)

        outputs = render_multi_platform_variants_sync(
            base_timeline,
            platforms,
            asset_urls=asset_urls,
            primary_video_src=reframed.presigned_url,
            upload_prefix=upload_prefix,
            ffprobe_duration=ffprobe_duration,
        )

    return base_timeline, outputs, reframed
