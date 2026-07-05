"""
Celery task — precompute AudioAnalysisTrack sidecar for long-form podcast audio (Path B).
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

import structlog
from celery import Task

from celery_app import celery_app
from processors.audio_analysis_track import build_from_media, quantize_sidecar
from processors.storage_helpers import storage_sync

log = structlog.get_logger("viraedit.tasks.audio_analysis")


def _sidecar_key(project_id: str, source_hash: str, fps: int, band_count: int) -> str:
    return f"projects/{project_id}/audio-analysis/{source_hash}_{fps}_{band_count}.json"


@celery_app.task(
    bind=True,
    name="tasks.audio_analysis.precompute",
    time_limit=3600,
    queue="analysis",
)
def precompute_audio_analysis(
    self: Task,
    *,
    project_id: str,
    storage_key: str,
    fps: float = 30,
    band_count: int = 16,
    job_id: str | None = None,
) -> dict[str, Any]:
    """
    Download source media, run librosa analysis, upload sidecar to MinIO.
    Keyed by (sourceHash, fps, bandCount) for cache invalidation.
    """
    jid = job_id or str(uuid.uuid4())
    log.info(
        "audio_analysis_start",
        project_id=project_id,
        storage_key=storage_key,
        fps=fps,
        band_count=band_count,
    )

    local_path = storage_sync.download_to_temp(storage_key, jid)
    from services.audio_analysis_service import source_hash_from_key

    track_hash = source_hash_from_key(storage_key)
    track = build_from_media(
        local_path,
        fps=fps,
        band_count=band_count,
        source_hash=track_hash,
    )
    payload = quantize_sidecar(track)

    sidecar_key = _sidecar_key(
        project_id,
        track["sourceHash"],
        int(fps),
        band_count,
    )
    storage_sync.put_object(sidecar_key, payload, content_type="application/json")

    log.info(
        "audio_analysis_done",
        sidecar_key=sidecar_key,
        frames=len(track.get("frames", [])),
        source_hash=track["sourceHash"],
    )

    return {
        "sidecar_key": sidecar_key,
        "source_hash": track["sourceHash"],
        "frame_count": len(track.get("frames", [])),
        "track": track,
    }
