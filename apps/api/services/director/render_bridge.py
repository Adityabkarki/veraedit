"""Director Engine — render bridge from compiled timeline to Remotion export."""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Asset, DirectorTimelineRecord, Project
from processors.remotion_client import render_director_export
from services.director.compile_timeline import get_active_director_timeline

log = structlog.get_logger("viraedit.director.render")

from services.director.render_precedence import (
    project_uses_director_engine as _project_settings_use_director_engine,
)


def project_uses_director_engine(project: Project) -> bool:
    return _project_settings_use_director_engine(project.settings)


async def render_project_director_export(
    *,
    project: Project,
    db: AsyncSession,
    output_path: str | Path,
    storage_presign: Any,
    timeline_record: DirectorTimelineRecord | None = None,
    sfx_presign: Any | None = None,
) -> str:
    """
    Render the active Director timeline for a project via remotion-service.

    Returns the local output path on success.
    """
    record = timeline_record or await get_active_director_timeline(project.id, db)
    if record is None:
        raise RuntimeError("No compiled Director timeline found for this project.")

    timeline = record.data
    asset_urls: dict[str, str] = {}
    primary_video_src: str | None = None

    result = await db.execute(select(Asset).where(Asset.project_id == project.id))
    for asset in result.scalars().all():
        url = storage_presign(asset.storage_key, asset.original_filename)
        asset_urls[str(asset.id)] = url
        if primary_video_src is None:
            primary_video_src = url

    sfx_urls: dict[str, str] = {}
    if sfx_presign:
        for entry in timeline.get("tracks", {}).get("sfx", []):
            sound_id = entry.get("soundId")
            if sound_id and sound_id not in sfx_urls:
                try:
                    sfx_urls[sound_id] = sfx_presign(sound_id)
                except Exception:
                    log.warning("director_sfx_url_missing", sound_id=sound_id)

    camera_feeds = (project.settings or {}).get("cameraFeeds") or []

    out = await render_director_export(
        timeline,
        output_path=str(output_path),
        asset_urls=asset_urls,
        primary_video_src=primary_video_src,
        dialogue_src=primary_video_src,
        camera_feeds=camera_feeds,
        sfx_urls=sfx_urls,
    )
    log.info(
        "director_render_complete",
        project_id=str(project.id),
        timeline_id=str(record.id),
        output=out,
    )
    return out
