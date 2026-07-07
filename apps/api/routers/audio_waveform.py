"""Downsampled waveform peaks from AudioAnalysisTrack (Phase 15)."""
from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from dependencies import CurrentUser, DbDep
from models import AudioAnalysisRecord, Project
from processors.storage_helpers import storage_sync
from processors.audio_analysis_binary import decode_sidecar_payload

router = APIRouter(prefix="/api/v1/projects", tags=["audio-waveform"])
log = structlog.get_logger("viraedit.audio_waveform")


@router.get("/{project_id}/audio-analysis/waveform")
async def get_project_waveform_peaks(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    bar_count: int = Query(500, alias="barCount", ge=16, le=4000),
) -> dict:
    """Return downsampled overallAmplitude peaks for timeline waveform UI."""
    project = await db.get(Project, project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")

    result = await db.execute(
        select(AudioAnalysisRecord)
        .where(AudioAnalysisRecord.project_id == str(project_id))
        .order_by(AudioAnalysisRecord.updated_at.desc())
        .limit(1)
    )
    record = result.scalar_one_or_none()
    if not record:
        return {"peaks": [], "fps": 30, "frameCount": 0}

    try:
        resp = storage_sync.client.get_object(
            Bucket=storage_sync.bucket,
            Key=record.storage_key,
        )
        raw = resp["Body"].read()
    except Exception as exc:
        log.warning("waveform_fetch_failed", error=str(exc))
        return {"peaks": [], "fps": record.fps, "frameCount": record.frame_count}

    track = decode_sidecar_payload(
        raw,
        source_hash=record.source_hash,
    )
    frames = (track or {}).get("frames") or []
    if not frames:
        return {"peaks": [], "fps": record.fps, "frameCount": 0}

    step = max(1, len(frames) // bar_count)
    peaks = [
        float(frames[i].get("overallAmplitude", 0))
        for i in range(0, len(frames), step)
    ][:bar_count]

    return {
        "peaks": peaks,
        "fps": record.fps,
        "frameCount": len(frames),
        "sourceHash": record.source_hash,
    }
