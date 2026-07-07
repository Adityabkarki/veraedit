"""Resolve DirectorRender props for preview and export parity."""
from __future__ import annotations

from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Asset, Project, Timeline
from processors.storage_helpers import S3Storage
from services.asset_media import playback_storage_key
from services.director.compile_timeline import get_active_director_timeline
from services.director.legacy_timeline_bridge import bridge_editor_timeline_to_director
from services.director.render_precedence import should_use_compiled_director_timeline

log = structlog.get_logger("viraedit.director.preview_props")

DIRECTOR_RENDER_COMPOSITION_ID = "DirectorRender"

BROLL_METADATA_SOURCES = frozenset({"ai_broll_generation", "stock_pexels"})


def _is_secondary_broll_asset(asset: Asset) -> bool:
    md = asset.media_metadata or {}
    if md.get("role") == "broll":
        return True
    source = md.get("source")
    if isinstance(source, str) and source in BROLL_METADATA_SOURCES:
        return True
    name = (asset.original_filename or "").lower()
    return name.startswith("broll_stock_") or name.startswith("broll_gen_")


def _pick_primary_project_asset(assets: list[Asset]) -> Asset | None:
    """Newest-first primary upload — ignores stock/AI B-roll assets."""
    if not assets:
        return None
    ordered = sorted(assets, key=lambda a: a.created_at, reverse=True)
    primary = [a for a in ordered if not _is_secondary_broll_asset(a)]
    if primary:
        return primary[0]
    return ordered[0]


async def get_active_editor_timeline(project_id: Any, db: AsyncSession) -> dict | None:
    result = await db.execute(
        select(Timeline)
        .where(Timeline.project_id == project_id, Timeline.is_active.is_(True))
        .order_by(Timeline.version.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    return row.data if row else None


async def resolve_director_timeline_for_render(
    project: Project,
    timeline_data: dict[str, Any],
    db: AsyncSession,
    *,
    width: int = 1920,
    height: int = 1080,
) -> dict[str, Any]:
    """
    Choose the sole DirectorTimeline source for preview/export (Primacy Law).
    Compiled timeline when present and flag is on; otherwise bridge editor timeline.
    """
    settings = project.settings or {}
    record = await get_active_director_timeline(project.id, db)
    compiled = record.data if record and record.data else None

    if should_use_compiled_director_timeline(settings=settings, compiled_timeline=compiled):
        log.info(
            "director_render_source_compiled",
            project_id=str(project.id),
            timeline_id=str(record.id) if record else None,
        )
        return compiled

    content_type = str(
        project.content_type.value
        if hasattr(project.content_type, "value")
        else project.content_type or "podcast"
    ).lower()
    if content_type not in ("podcast", "consultancy", "social", "showcase"):
        content_type = "podcast"

    theme = (timeline_data.get("metadata") or {}).get("theme")
    log.info(
        "director_render_source_bridge",
        project_id=str(project.id),
        use_director_engine=bool(
            settings.get("useDirectorEngine") or settings.get("use_director_engine")
        ),
        has_compiled=compiled is not None,
    )
    return await bridge_editor_timeline_to_director(
        timeline_data,
        project_id=str(project.id),
        width=width,
        height=height,
        content_type=content_type,
        theme=theme if isinstance(theme, dict) else None,
    )


async def resolve_director_render_props(
    project: Project,
    timeline_data: dict[str, Any],
    db: AsyncSession,
    *,
    width: int = 1920,
    height: int = 1080,
) -> dict[str, Any]:
    """
    Build the exact DirectorRender input props used by unified export.
    Preview and export must call this — never construct props separately.
    """
    director_timeline = await resolve_director_timeline_for_render(
        project, timeline_data, db, width=width, height=height,
    )

    storage = S3Storage()
    result = await db.execute(
        select(Asset)
        .where(Asset.project_id == project.id)
        .order_by(Asset.created_at.desc())
    )
    assets = list(result.scalars().all())
    primary = _pick_primary_project_asset(assets)

    asset_urls: dict[str, str] = {}
    primary_video_src: str | None = None
    for asset in assets:
        key = playback_storage_key(asset)
        url = storage.get_presigned_url(key, filename=asset.original_filename)
        asset_urls[str(asset.id)] = url

    if primary is not None:
        primary_video_src = asset_urls.get(str(primary.id))

    camera_feeds = (project.settings or {}).get("cameraFeeds") or []

    return {
        "compositionId": DIRECTOR_RENDER_COMPOSITION_ID,
        "durationInFrames": int(director_timeline.get("durationInFrames") or 300),
        "fps": int(director_timeline.get("fps") or 30),
        "width": int(director_timeline.get("width") or width),
        "height": int(director_timeline.get("height") or height),
        "inputProps": {
            "timeline": director_timeline,
            "assetUrls": asset_urls,
            "primaryVideoSrc": primary_video_src,
            "dialogueSrc": primary_video_src,
            "cameraFeeds": camera_feeds,
            "sfxUrls": {},
            "fontFamily": "Montserrat",
        },
    }
