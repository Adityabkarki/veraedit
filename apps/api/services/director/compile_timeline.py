"""
Director Engine — compile orchestration.

Loads project transcript + signals, calls remotion-service runDirector(),
persists the resolved DirectorTimeline with version chaining and overwrite safety.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Asset, AssetStatus, DirectorTimelineRecord, Project, Transcript
from services.brand_theme_service import brand_kit_to_theme, apply_style_dna_to_theme, validate_style_depth
from services.director.content_type_map import (
    default_dimensions,
    resolve_director_content_type,
)
from services.director.extract_signals import extract_director_signals
from services.director.resolve_broll import resolve_broll_entries
from services.director.transcript_segments import words_to_segments
from services.multicam.project_feeds import ensure_project_camera_feeds
from processors.remotion_client import compile_director_timeline

log = structlog.get_logger("viraedit.director.compile")

_MEDIA_READY = {
    AssetStatus.ANALYZING,
    AssetStatus.READY,
}


class DirectorCompileError(Exception):
    """Base error with a user-facing English message."""

    def __init__(self, message: str, *, code: str = "compile_failed") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


class ManualOverridesPresentError(DirectorCompileError):
    def __init__(self, existing_timeline_id: uuid.UUID) -> None:
        super().__init__(
            "This project has manual Director timeline edits. "
            "Pass overwrite=true to replace the active timeline, "
            "or continue editing the existing version.",
            code="manual_overrides_present",
        )
        self.existing_timeline_id = existing_timeline_id


async def get_active_director_timeline(
    project_id: uuid.UUID,
    db: AsyncSession,
) -> DirectorTimelineRecord | None:
    result = await db.execute(
        select(DirectorTimelineRecord)
        .where(
            DirectorTimelineRecord.project_id == project_id,
            DirectorTimelineRecord.is_active.is_(True),
        )
        .order_by(DirectorTimelineRecord.version.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def compile_project_director_timeline(
    *,
    project: Project,
    db: AsyncSession,
    content_type: str | None = None,
    density: str = "balanced",
    pacing: str | None = None,
    signals: dict[str, Any] | None = None,
    asset_id: uuid.UUID | None = None,
    overwrite: bool = False,
    fps: float = 30.0,
    width: int | None = None,
    height: int | None = None,
    storage_upload: Any | None = None,
) -> dict[str, Any]:
    """
    Run the full compile pipeline for a project.

    Returns { timelineId, timeline, version, hasManualOverrides }.
    """
    director_content_type = resolve_director_content_type(
        project_content_type=project.content_type,
        override=content_type,
    )
    default_w, default_h = default_dimensions(director_content_type)
    frame_width = width or default_w
    frame_height = height or default_h

    active = await get_active_director_timeline(project.id, db)
    if active and active.has_manual_overrides and not overwrite:
        raise ManualOverridesPresentError(active.id)

    asset = await _load_primary_asset(project.id, db, asset_id)
    transcript = await _load_transcript(asset.id, db)
    words = list(transcript.words or [])
    segments = words_to_segments(words)

    if not signals:
        signals = extract_director_signals(
            segments=segments,
            words=words,
            duration_seconds=float(asset.duration_seconds or 0),
            fps=fps,
            speakers_meta=list(transcript.speakers or []),
        )

    camera_feeds = await ensure_project_camera_feeds(project, db, fps=fps)

    duration_seconds = float(
        signals.get("durationSeconds")
        or asset.duration_seconds
        or _infer_duration(words, segments)
    )
    if duration_seconds <= 0:
        raise DirectorCompileError(
            "Video duration is unknown. Wait for ingest to finish before compiling."
        )

    theme = _resolve_theme(project)
    compile_payload = {
        "projectId": str(project.id),
        "contentType": director_content_type,
        "fps": fps,
        "durationSeconds": duration_seconds,
        "width": frame_width,
        "height": frame_height,
        "theme": theme,
        "signals": signals,
        "density": density,
        "sourceAssetId": str(asset.id),
    }
    if pacing:
        compile_payload["pacing"] = pacing
    if camera_feeds:
        compile_payload["cameraFeeds"] = camera_feeds

    timeline = await compile_director_timeline(compile_payload)
    timeline = resolve_broll_entries(
        timeline,
        content_type=director_content_type,
        theme=theme,
    )

    new_version = (active.version + 1) if active else 1
    parent_id = active.id if active else None

    if active:
        active.is_active = False

    record = DirectorTimelineRecord(
        project_id=project.id,
        version=new_version,
        content_type=director_content_type,
        data=timeline,
        parent_id=parent_id,
        is_active=True,
        has_manual_overrides=False,
        compiled_at=datetime.now(timezone.utc),
    )
    db.add(record)
    await db.flush()

    from services.director.timeline_entry_sync import sync_timeline_entry_index

    await sync_timeline_entry_index(db, record.id, timeline)

    if storage_upload is not None:
        key = f"projects/{project.id}/director-timelines/{record.id}.json"
        try:
            storage_upload(
                key,
                json.dumps(timeline, ensure_ascii=False).encode("utf-8"),
                "application/json",
            )
            record.storage_key = key
        except Exception as exc:
            log.warning("director_timeline_minio_archive_failed", error=str(exc))

    await db.commit()
    await db.refresh(record)

    log.info(
        "director_timeline_compiled",
        project_id=str(project.id),
        timeline_id=str(record.id),
        version=new_version,
        content_type=director_content_type,
        realized_triggers=sum(
            1 for t in timeline.get("triggers", []) if t.get("status") == "realized"
        ),
    )

    return {
        "timelineId": str(record.id),
        "timeline": timeline,
        "version": new_version,
        "hasManualOverrides": False,
        "contentType": director_content_type,
    }


async def _load_primary_asset(
    project_id: uuid.UUID,
    db: AsyncSession,
    asset_id: uuid.UUID | None,
) -> Asset:
    if asset_id:
        result = await db.execute(
            select(Asset).where(Asset.id == asset_id, Asset.project_id == project_id)
        )
        asset = result.scalar_one_or_none()
        if asset is None:
            raise DirectorCompileError("The requested asset was not found for this project.")
        return asset

    result = await db.execute(
        select(Asset)
        .where(Asset.project_id == project_id)
        .order_by(Asset.created_at.asc())
    )
    assets = list(result.scalars().all())
    for candidate in assets:
        if candidate.status in _MEDIA_READY:
            return candidate
    if assets:
        return assets[0]
    raise DirectorCompileError(
        "No uploaded video found for this project. Upload a video before compiling."
    )


async def _load_transcript(asset_id: uuid.UUID, db: AsyncSession) -> Transcript:
    result = await db.execute(select(Transcript).where(Transcript.asset_id == asset_id))
    transcript = result.scalar_one_or_none()
    if transcript is None or not transcript.words:
        raise DirectorCompileError(
            "Transcript is not ready yet. Wait for transcription to finish before compiling."
        )
    return transcript


def _resolve_theme(project: Project) -> dict[str, Any]:
    settings = project.settings or {}
    brand_kit = settings.get("brand_kit") or settings.get("brandKit")
    style_dna = settings.get("style_dna") or settings.get("styleDna")

    if isinstance(brand_kit, dict) and brand_kit:
        theme = brand_kit_to_theme(brand_kit)
    else:
        theme = brand_kit_to_theme(
            {
                "primaryColor": "#C41E3A",
                "secondaryColor": "#111113",
                "accentColor": "#F59E0B",
                "fontStyle": "nepali",
                "logoText": project.name or "ViraEdit",
            }
        )

    if isinstance(style_dna, dict) and style_dna:
        theme = apply_style_dna_to_theme(theme, style_dna)

    depth = validate_style_depth(theme)
    meta = dict(theme.get("meta") or {})
    meta["styleDepthOk"] = depth["ok"]
    if not depth["ok"]:
        meta["styleDepthMissing"] = depth["missing"]
    theme["meta"] = meta
    return theme


def _infer_duration(words: list[dict], segments: list[dict]) -> float:
    ends = [float(s.get("end", 0)) for s in segments if s.get("end") is not None]
    ends += [float(w.get("end", 0)) for w in words if w.get("end") is not None]
    return max(ends) if ends else 0.0
