"""Build and sync multicam camera feeds for a project — Multicam Sync Law."""
from __future__ import annotations

import tempfile
import uuid
from pathlib import Path
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Asset, MediaType, Project
from processors.storage_helpers import storage_sync
from services.multicam.sync import rms_envelope_from_audio, sync_camera_feeds

log = structlog.get_logger("viraedit.multicam.project_feeds")

_SPEAKER_IDS = ["A", "B", "C", "D"]


async def list_project_video_assets(
    project_id: uuid.UUID,
    db: AsyncSession,
) -> list[Asset]:
    result = await db.execute(
        select(Asset)
        .where(Asset.project_id == project_id, Asset.media_type == MediaType.VIDEO)
        .order_by(Asset.created_at.asc())
    )
    return list(result.scalars().all())


def build_synced_camera_feeds(
    assets: list[Asset],
    *,
    fps: float = 30.0,
) -> list[dict[str, Any]]:
    """
    Cross-correlate audio RMS envelopes and return CameraFeedRef payloads.

    sourceUrl stores the asset id — render bridge resolves presigned URLs.
    """
    if len(assets) < 2:
        return []

    feed_inputs: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="viraedit_multicam_") as tmp_dir:
        tmp_path = Path(tmp_dir)
        for i, asset in enumerate(assets):
            try:
                local = storage_sync.download_to_temp(asset.storage_key, str(asset.id))
                audio_path = _audio_path_for_asset(local, tmp_path / f"audio-{i}")
                rms = rms_envelope_from_audio(audio_path, target_fps=fps)
            except Exception as exc:
                log.warning(
                    "multicam_rms_failed",
                    asset_id=str(asset.id),
                    error=str(exc),
                )
                rms = [1.0]

            meta = asset.media_metadata or {}
            label = str(meta.get("camera_label") or asset.name or f"Camera {i + 1}")
            feed_inputs.append(
                {
                    "id": str(asset.id),
                    "label": label,
                    "sourceUrl": str(asset.id),
                    "rmsEnvelope": rms,
                    "speakerId": _SPEAKER_IDS[i] if i < len(_SPEAKER_IDS) else f"S{i}",
                }
            )

    synced = sync_camera_feeds(feed_inputs, fps=fps)
    return [
        {
            "id": feed["id"],
            "label": feed.get("label", ""),
            "sourceUrl": feed.get("sourceUrl", feed["id"]),
            "syncOffsetFrames": int(feed.get("syncOffsetFrames", 0)),
            "speakerId": feed.get("speakerId"),
        }
        for feed in synced
    ]


def sync_project_multicam_feeds_sync(project_id: str, *, fps: float = 30.0) -> dict[str, Any]:
    """Celery-safe sync — updates project.settings.cameraFeeds when 2+ videos exist."""
    from sqlalchemy import create_engine, text

    from config import settings

    engine = create_engine(
        settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://"),
        pool_pre_ping=True,
    )

    with engine.begin() as conn:
        rows = conn.execute(
            text(
                """
                SELECT id, name, storage_key, media_metadata
                FROM assets
                WHERE project_id = :pid AND media_type = 'VIDEO'
                ORDER BY created_at ASC
                """
            ),
            {"pid": project_id},
        ).fetchall()

        if len(rows) < 2:
            return {"synced": False, "feed_count": len(rows)}

        class _RowAsset:
            def __init__(self, row: Any) -> None:
                self.id = row[0]
                self.name = row[1]
                self.storage_key = row[2]
                self.media_metadata = row[3] if isinstance(row[3], dict) else {}

        assets = [_RowAsset(r) for r in rows]
        feeds = build_synced_camera_feeds(assets, fps=fps)  # type: ignore[arg-type]

        conn.execute(
            text(
                """
                UPDATE projects
                SET settings = COALESCE(settings, '{}'::jsonb) || CAST(:patch AS jsonb),
                    updated_at = NOW()
                WHERE id = :pid
                """
            ),
            {
                "pid": project_id,
                "patch": __import__("json").dumps({"cameraFeeds": feeds}),
            },
        )

    log.info("multicam_project_synced", project_id=project_id, feeds=len(feeds))
    return {"synced": True, "feed_count": len(feeds), "cameraFeeds": feeds}


async def ensure_project_camera_feeds(
    project: Project,
    db: AsyncSession,
    *,
    fps: float = 30.0,
    force_resync: bool = False,
) -> list[dict[str, Any]]:
    """
    Return synced camera feeds for compile/render.

    Re-syncs when multiple video assets exist and feeds are missing or stale.
    """
    assets = await list_project_video_assets(project.id, db)
    if len(assets) < 2:
        return []

    settings = project.settings or {}
    existing = settings.get("cameraFeeds") or []
    asset_ids = {str(a.id) for a in assets}
    existing_ids = {str(f.get("id")) for f in existing if isinstance(f, dict)}

    if not force_resync and existing and existing_ids == asset_ids:
        return list(existing)

    feeds = build_synced_camera_feeds(assets, fps=fps)
    merged = dict(settings)
    merged["cameraFeeds"] = feeds
    project.settings = merged
    await db.flush()

    log.info(
        "multicam_feeds_updated",
        project_id=str(project.id),
        feed_count=len(feeds),
    )
    return feeds


def _audio_path_for_asset(local_video: Path, audio_out: Path) -> Path:
    if local_video.suffix.lower() in {".wav", ".mp3", ".m4a", ".aac", ".flac"}:
        return local_video
    from tasks.audio import extract_audio

    return extract_audio(local_video, output_dir=audio_out.parent)
