"""
Attach frame-accurate audio analysis to motion plans for podcast reactive graphics.

Path A (≤3 min): pass presigned audio URL — Remotion decodes via getAudioData at mount.
Path B (>3 min): load precomputed MinIO sidecar, or build synchronously during render.
"""
from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any

from processors.storage_helpers import storage_sync

log = logging.getLogger("viraedit.services.audio_analysis")

CLIENT_ANALYSIS_MAX_SECONDS = 180
DEFAULT_BAND_COUNT = 16

AUDIO_REACTIVE_TYPES = frozenset({
    "symmetric_audio_strip",
    "circular_orbit_equalizer",
    "circular_waveform",
    "eq_visualizer",
    "active_speaker_split",
})


def plan_needs_audio_analysis(plan: dict[str, Any]) -> bool:
    for el in plan.get("elements") or []:
        if str(el.get("type", "")).lower() in AUDIO_REACTIVE_TYPES:
            return True
    return False


def source_hash_from_key(storage_key: str) -> str:
    return hashlib.sha256(storage_key.encode("utf-8")).hexdigest()[:16]


def source_hash_from_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def sidecar_storage_key(
    project_id: str,
    source_hash: str,
    fps: int,
    band_count: int,
    *,
    binary: bool = True,
) -> str:
    ext = "vae.bin.gz" if binary else "json"
    return f"projects/{project_id}/audio-analysis/{source_hash}_{fps}_{band_count}.{ext}"


def load_sidecar_track(
    project_id: str,
    source_hash: str,
    fps: int,
    band_count: int,
) -> dict[str, Any] | None:
    from processors.audio_analysis_binary import decode_sidecar_payload

    for binary in (True, False):
        key = sidecar_storage_key(project_id, source_hash, fps, band_count, binary=binary)
        try:
            resp = storage_sync.client.get_object(
                Bucket=storage_sync.bucket,
                Key=key,
            )
            raw = resp["Body"].read()
            track = decode_sidecar_payload(raw, source_hash=source_hash)
            if isinstance(track, dict) and track.get("frames"):
                return track
        except Exception as exc:
            log.debug("audio_sidecar_miss key=%s error=%s", key, exc)
    return None


def store_sidecar_track(
    project_id: str,
    track: dict[str, Any],
    fps: int,
    band_count: int,
    *,
    db_session: Any | None = None,
) -> str:
    from processors.audio_analysis_binary import encode_analysis_track

    source_hash = str(track.get("sourceHash") or "unknown")
    key = sidecar_storage_key(project_id, source_hash, fps, band_count, binary=True)
    payload = encode_analysis_track(track)
    storage_sync.put_object(
        key,
        payload,
        content_type="application/vnd.viraedit.audio-analysis+binary",
    )
    frames = track.get("frames") or []
    meta = dict(track.get("meta") or {})
    meta["storageFormat"] = "binary"

    if db_session is not None:
        _upsert_audio_analysis_record(
            db_session,
            project_id=project_id,
            source_hash=source_hash,
            storage_key=key,
            track=track,
            fps=fps,
            band_count=band_count,
            meta=meta,
        )

    log.info(
        "audio_sidecar_stored key=%s frames=%d bytes=%d format=binary",
        key,
        len(frames),
        len(payload),
    )
    return key


def _upsert_audio_analysis_record(
    db_session: Any,
    *,
    project_id: str,
    source_hash: str,
    storage_key: str,
    track: dict[str, Any],
    fps: int,
    band_count: int,
    meta: dict[str, Any],
) -> None:
    """Persist metadata pointer row (no per-frame data in Postgres)."""
    try:
        from sqlalchemy import select

        from models.audio_analysis_record import AudioAnalysisRecord

        result = db_session.execute(
            select(AudioAnalysisRecord).where(
                AudioAnalysisRecord.project_id == project_id,
                AudioAnalysisRecord.source_hash == source_hash,
                AudioAnalysisRecord.fps == fps,
                AudioAnalysisRecord.band_count == band_count,
            )
        )
        existing = result.scalar_one_or_none()
        frames = track.get("frames") or []
        if existing:
            existing.storage_key = storage_key
            existing.frame_count = len(frames)
            existing.peak_amplitude = float(track.get("peakAmplitude") or 1.0)
            existing.storage_format = "binary"
            existing.meta_json = meta
        else:
            db_session.add(
                AudioAnalysisRecord(
                    project_id=project_id,
                    source_hash=source_hash,
                    storage_key=storage_key,
                    schema_version=2,
                    fps=fps,
                    frame_count=len(frames),
                    band_count=band_count,
                    peak_amplitude=float(track.get("peakAmplitude") or 1.0),
                    storage_format="binary",
                    meta_json=meta,
                )
            )
    except Exception as exc:
        log.warning("audio_analysis_record_upsert_failed error=%s", exc)


def build_server_track_sync(
    media_path: Path,
    fps: int,
    band_count: int,
    source_hash: str,
) -> dict[str, Any]:
    from processors.audio_analysis_track import build_from_media

    return build_from_media(
        media_path,
        fps=float(fps),
        band_count=band_count,
        source_hash=source_hash,
    )


def attach_audio_analysis_to_plan(
    plan: dict[str, Any],
    *,
    project_id: str,
    storage_key: str,
    duration_seconds: float,
    local_media_path: str | Path | None = None,
    band_count: int = DEFAULT_BAND_COUNT,
) -> dict[str, Any]:
    """
    Enrich a motion plan with audio analysis routing metadata.
    Mutates and returns the same plan dict.
    """
    if not plan_needs_audio_analysis(plan):
        return plan

    fps = int(plan.get("fps") or 30)
    media = Path(local_media_path) if local_media_path else None
    source_hash = source_hash_from_key(storage_key)

    audio_block: dict[str, Any] = {
        "durationSeconds": duration_seconds,
        "bandCount": band_count,
        "sourceHash": source_hash,
        "fps": fps,
    }

    if duration_seconds > CLIENT_ANALYSIS_MAX_SECONDS:
        track = load_sidecar_track(project_id, source_hash, fps, band_count)
        if not track and media and media.exists():
            log.info(
                "audio_sidecar_build_sync project=%s duration=%.1fs",
                project_id,
                duration_seconds,
            )
            try:
                track = build_server_track_sync(media, fps, band_count, source_hash)
                store_sidecar_track(project_id, track, fps, band_count)
            except Exception as exc:
                log.warning("audio_sidecar_sync_build_failed error=%s", exc)
                track = None

        if track:
            audio_block["analysisPath"] = "server_librosa"
            audio_block["track"] = track
            plan["audio"] = audio_block
            log.info(
                "audio_analysis_attached path=server frames=%d",
                len(track.get("frames") or []),
            )
        else:
            log.warning(
                "audio_analysis_missing_long_form project=%s duration=%.1fs",
                project_id,
                duration_seconds,
            )
            plan["audio"] = {
                **audio_block,
                "analysisPath": "server_librosa",
                "error": "sidecar_unavailable",
            }
    else:
        try:
            audio_url = storage_sync.get_presigned_url(
                storage_key,
                expires=7200,
                filename=Path(storage_key).name,
            )
        except Exception as exc:
            log.warning("audio_presign_failed key=%s error=%s", storage_key, exc)
            return plan

        plan["audio"] = {
            **audio_block,
            "src": audio_url,
            "analysisPath": "client_visualizeAudio",
        }
        log.info(
            "audio_analysis_attached path=client duration=%.1fs",
            duration_seconds,
        )

    return plan


def queue_long_form_precompute(
    project_id: str,
    storage_key: str,
    duration_seconds: float | None,
    *,
    fps: int = 30,
    band_count: int = DEFAULT_BAND_COUNT,
) -> None:
    """Queue Path B precompute at ingest for episodes longer than the client threshold."""
    if not duration_seconds or duration_seconds <= CLIENT_ANALYSIS_MAX_SECONDS:
        return
    try:
        from celery_app import celery_app

        celery_app.send_task(
            "tasks.audio_analysis.precompute",
            kwargs={
                "project_id": project_id,
                "storage_key": storage_key,
                "fps": float(fps),
                "band_count": band_count,
            },
            queue="analysis",
        )
        log.info(
            "audio_analysis_precompute_queued project=%s duration=%.1fs",
            project_id,
            duration_seconds,
        )
    except Exception as exc:
        log.warning(
            "audio_analysis_precompute_queue_failed project=%s error=%s",
            project_id,
            exc,
        )
