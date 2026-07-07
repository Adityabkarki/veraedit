"""
Director-styled Short/Sizzle — async facade over styled_shorts_pipeline.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from services.director.styled_shorts_pipeline import (
    build_prepare_payload,
    load_styled_short_context_sync,
    platforms_from_scores,
    prepare_styled_short_timeline_sync as _prepare_sync,
)

__all__ = [
    "prepare_styled_short_timeline",
    "prepare_styled_short_timeline_sync",
    "platforms_from_scores",
]


async def prepare_styled_short_timeline(
    *,
    project_id: uuid.UUID,
    db: AsyncSession,
    start_time: float,
    end_time: float,
    asset_id: uuid.UUID | None = None,
    hook: str | None = None,
    viral_score: float | None = None,
    platform: str = "tiktok",
    target_content_type: str = "social",
) -> dict[str, Any]:
    """Build base DirectorTimeline (no platform variant) for a clip window."""
    from models import Project

    project = await db.get(Project, project_id)
    if project is None:
        raise ValueError("Project not found for styled short preparation.")

    ctx = load_styled_short_context_sync(
        str(project_id),
        asset_id=str(asset_id) if asset_id else None,
    )
    payload = build_prepare_payload(
        ctx,
        start_time=start_time,
        end_time=end_time,
        hook=hook,
        viral_score=viral_score,
        base_only=True,
    )
    payload["targetContentType"] = target_content_type
    return _prepare_sync(payload)


def prepare_styled_short_timeline_sync(payload: dict[str, Any]) -> dict[str, Any]:
    return _prepare_sync(payload)
