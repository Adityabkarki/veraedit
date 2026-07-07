"""
ViraEdit — Render Celery Task.

Encodes a timeline into a video file via FFmpeg.

Queue: "render"
Retries: 1 max (render failures need human review)

The task:
1. Loads the active timeline for the project
2. Resolves all asset paths from MinIO
3. Renders per-clip video segments with speed + color effects
4. Concatenates segments via concat demuxer
5. Mixes music / SFX / audio tracks positioned at correct timeline times
6. Composites overlay clips (b-roll, images) onto the main video
7. Burns captions via ASS subtitles or Remotion
8. Uploads the output to MinIO (viraedit-renders bucket)
9. Updates Render.status → READY and Render.storage_key
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from celery_app import celery_app
from tasks.export_timeline import (
    caption_style_from_metadata,
    clip_cache_key,
    clip_effects_by_type,
    collect_render_clips,
    http_media_url,
    log_caption_preview_vs_render,
    log_render_plan,
    overlay_is_media_clip,
    overlay_layout,
    sfx_slug_from_clip,
    zoom_scale_at_time,
)

log = logging.getLogger("viraedit.tasks.render")

# Platform encoding presets
PLATFORM_PRESETS = {
    "youtube":          {"width": 1920, "height": 1080, "crf": 18, "audio_bitrate": "192k"},
    "youtube_shorts":   {"width": 1080, "height": 1920, "crf": 18, "audio_bitrate": "192k"},
    "instagram":        {"width": 1080, "height": 1080, "crf": 20, "audio_bitrate": "128k"},
    "instagram_reels":  {"width": 1080, "height": 1920, "crf": 20, "audio_bitrate": "128k"},
    "tiktok":           {"width": 1080, "height": 1920, "crf": 22, "audio_bitrate": "128k"},
    "facebook":         {"width": 1280, "height": 720,  "crf": 20, "audio_bitrate": "128k"},
    "custom":           {"width": 1920, "height": 1080, "crf": 18, "audio_bitrate": "192k"},
}


@celery_app.task(
    name="render_video",
    queue="render",
    max_retries=1,
    default_retry_delay=60,
    acks_late=True,
    bind=True,
)
def render_video(
    self,
    render_id: str,
    project_id: str,
    platform: str = "youtube",
) -> dict:
    """
    Encode a project timeline to video for the specified platform.

    Args:
        render_id:  UUID of the Render row to process.
        project_id: UUID of the project being rendered.
        platform:   Target platform (determines resolution/codec settings).

    Returns:
        dict with {"status": "ready", "storage_key": "...", "duration_s": ...}
        or {"status": "error", "error": "..."}
    """
    log.info(
        "render_task_start: render_id=%s project_id=%s platform=%s",
        render_id, project_id, platform,
    )

    try:
        # Update render status → PROCESSING
        _update_render_status(render_id, "processing", progress=5.0)

        # Load stored job settings (short-clip trim, etc.)
        job = _load_render_job(render_id)
        stored_settings = (job or {}).get("render_settings") or {}

        # Load timeline and resolve asset paths
        timeline_data = _load_timeline(render_id, project_id)
        if not timeline_data:
            raise RuntimeError("No active timeline found for this project.")

        # Get platform encoding preset
        preset = PLATFORM_PRESETS.get(platform, PLATFORM_PRESETS["youtube"])

        # Build render settings record (merge stored short-clip params)
        render_settings = {
            "platform": platform,
            "width": preset["width"],
            "height": preset["height"],
            "crf": preset["crf"],
            "audio_bitrate": preset["audio_bitrate"],
            "codec": "libx264",
            "audio_codec": "aac",
            "format": "mp4",
            **stored_settings,
        }

        _update_render_status(render_id, "processing", progress=15.0)

        if stored_settings.get("is_short"):
            director_short = _render_director_styled_short(
                render_id,
                project_id,
                platform,
                stored_settings,
                render_settings,
            )
            if director_short is not None:
                storage_key, out_duration = director_short
            elif stored_settings.get("director_styled") and not stored_settings.get(
                "allow_legacy_fallback"
            ):
                raise RuntimeError(
                    "Director-styled short render failed. "
                    "Ensure the Remotion service is running, then retry. "
                    "Pass allow_legacy_fallback=true to use the legacy FFmpeg crop."
                )
            else:
                storage_key, out_duration = _render_short_clip(
                    render_id,
                    str(stored_settings.get("asset_id", "")),
                    float(stored_settings.get("start_time", 0.0)),
                    float(stored_settings.get("end_time", 0.0)),
                    render_settings,
                )
        else:
            unified_result = _render_unified_director_export(
                render_id,
                project_id,
                render_settings,
                timeline_data,
            )
            if unified_result is not None:
                storage_key, out_duration = unified_result
            else:
                _surface_director_fallback_warning(
                    render_id, project_id, render_settings,
                )
                storage_key, out_duration = _real_render(
                    render_id, project_id, platform, render_settings, timeline_data
                )

        # Mark render as READY
        _update_render_complete(
            render_id,
            storage_key=storage_key,
            duration_seconds=out_duration,
            render_settings=render_settings,
        )

        log.info(
            "render_task_complete: render_id=%s storage_key=%s",
            render_id, storage_key,
        )
        return {
            "status": "ready",
            "render_id": render_id,
            "storage_key": storage_key,
        }

    except Exception as exc:
        log.error(
            "render_task_failed: render_id=%s error=%s",
            render_id, exc, exc_info=True,
        )
        _update_render_error(render_id, str(exc))
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            return {"status": "error", "render_id": render_id, "error": str(exc)}


# ── DB helpers (sync, called from Celery worker) ──────────────────────────────

def _get_sync_conn():
    """Create a synchronous SQLAlchemy connection for Celery context."""
    from sqlalchemy import create_engine
    from config import settings
    sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
    engine = create_engine(sync_url)
    return engine


def _update_render_status(
    render_id: str,
    status: str,
    progress: float = 0.0,
    error: str = "",
) -> None:
    """Update render status in database."""
    from sqlalchemy import text
    engine = _get_sync_conn()
    project_id: str | None = None
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT project_id FROM renders WHERE id = :id"),
            {"id": render_id},
        ).fetchone()
        if row:
            project_id = str(row.project_id)
        conn.execute(
            text(
                "UPDATE renders SET status = :status, progress_percent = :progress, "
                "error_message = NULLIF(:error, ''), updated_at = NOW() "
                "WHERE id = :id"
            ),
            # render_status_enum stores UPPERCASE labels (QUEUED/PROCESSING/READY/ERROR)
            {"status": status.upper(), "progress": progress, "error": error, "id": render_id},
        )
    engine.dispose()

    if project_id:
        try:
            from ws.publisher import emit_render_progress
            emit_render_progress(
                project_id,
                render_id,
                status=status,
                progress_percent=progress,
            )
        except Exception:
            pass


def _update_render_complete(
    render_id: str,
    storage_key: str,
    duration_seconds: float,
    render_settings: dict,
) -> None:
    """Mark render as complete with output metadata."""
    import json
    from sqlalchemy import text
    engine = _get_sync_conn()
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE renders SET status = 'READY', progress_percent = 100.0, "
                "storage_key = :key, duration_seconds = :dur, "
                "render_settings = CAST(:settings AS jsonb), updated_at = NOW() "
                "WHERE id = :id"
            ),
            {
                "key": storage_key,
                "dur": duration_seconds,
                "settings": json.dumps(render_settings),
                "id": render_id,
            },
        )
    engine.dispose()


def _update_render_error(render_id: str, error_message: str) -> None:
    """Mark render as failed with an error message."""
    from sqlalchemy import text
    engine = _get_sync_conn()
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE renders SET status = 'ERROR', error_message = :err, "
                "updated_at = NOW() WHERE id = :id"
            ),
            {"err": error_message[:1999], "id": render_id},
        )
    engine.dispose()


def _load_render_job(render_id: str) -> dict | None:
    """Load render row metadata including render_settings JSON."""
    import json
    from sqlalchemy import text
    engine = _get_sync_conn()
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT platform, render_settings FROM renders WHERE id = :id"
                ),
                {"id": render_id},
            ).fetchone()
    finally:
        engine.dispose()
    if not row:
        return None
    settings = row[1]
    if isinstance(settings, str):
        settings = json.loads(settings)
    return {"platform": row[0], "render_settings": settings or {}}


def _load_timeline(render_id: str, project_id: str) -> dict | None:
    """Load the exact timeline snapshot selected for this render."""
    from sqlalchemy import text
    engine = _get_sync_conn()
    with engine.connect() as conn:
        pinned = conn.execute(
            text(
                "SELECT t.data FROM renders r "
                "JOIN timelines t ON t.id = r.timeline_id "
                "WHERE r.id = :rid AND r.project_id = :pid LIMIT 1"
            ),
            {"rid": render_id, "pid": project_id},
        ).fetchone()
        if pinned:
            engine.dispose()
            return pinned[0]
        result = conn.execute(
            text(
                "SELECT data FROM timelines "
                "WHERE project_id = :pid AND is_active = TRUE "
                "ORDER BY version DESC LIMIT 1"
            ),
            {"pid": project_id},
        )
        row = result.fetchone()
    engine.dispose()
    return row[0] if row else None


# ── Real FFmpeg render ────────────────────────────────────────────────────────

def _s3_client():
    """boto3 S3 client for MinIO (sync — safe in Celery)."""
    import boto3
    from botocore.config import Config
    from config import settings
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        region_name="us-east-1",
    )


def _clip_effect_param(clip: dict, effect_type: str, param: str) -> Any:
    """Read a param from the first matching effect on a clip."""
    for effect in clip.get("effects", []):
        if effect.get("type") == effect_type:
            params = effect.get("params") or {}
            if param in params:
                return params[param]
    return None


def _clip_storage_key(clip: dict) -> str | None:
    """Resolve MinIO key from clip effects or the assets table."""
    for effect in clip.get("effects", []):
        params = effect.get("params") or {}
        key = params.get("storage_key")
        if key:
            return str(key)
    asset_id = clip.get("asset_id")
    if asset_id and not str(asset_id).startswith("clip-"):
        return _asset_storage_key(str(asset_id))
    return None


def _download_clip_source(clip: dict, dest_dir) -> "Path | None":  # type: ignore[name-defined]
    """Download a clip's audio/video source from MinIO or HTTP."""
    import urllib.request
    from pathlib import Path

    key = _clip_storage_key(clip)
    if key:
        dest = Path(dest_dir) / Path(key).name
        _s3_client().download_file(Bucket="viraedit-media", Key=key, Filename=str(dest))
        return dest

    url = http_media_url(clip)
    if url:
        suffix = Path(urlparse(url).path).suffix or ".bin"
        dest = Path(dest_dir) / f"http_{clip.get('id', 'media')}{suffix}"
        urllib.request.urlretrieve(url, str(dest))
        return dest if dest.exists() else None

    slug = sfx_slug_from_clip(clip)
    if slug:
        from services.sfx_library import local_sfx_path
        local = local_sfx_path(slug)
        if local and local.is_file():
            dest = Path(dest_dir) / local.name
            dest.write_bytes(local.read_bytes())
            return dest

    return None


def _music_clip_needs_ducking(clip: dict) -> bool:
    return bool(_clip_effect_param(clip, "music_bed", "duck_under_voice"))


def _mix_audio_with_ducking(
    voice_video_path: "Path",
    music_path: "Path",
    output_path: "Path",
    music_volume: float = 0.2,
) -> "Path":
    """Mix voice audio from the main video with background music, ducking under speech."""
    import subprocess
    from config import settings

    filter_complex = (
        f"[1:a]volume={music_volume}[music];"
        f"[0:a][music]sidechaincompress="
        f"threshold=0.05:ratio=8:attack=5:release=200[ducked];"
        f"[0:a][ducked]amix=inputs=2:duration=first[aout]"
    )
    subprocess.run([
        settings.FFMPEG_PATH,
        "-y",
        "-i", str(voice_video_path),
        "-i", str(music_path),
        "-filter_complex", filter_complex,
        "-map", "0:v:0",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        str(output_path),
    ], check=True, capture_output=True)
    return output_path


def _asset_storage_key(asset_id: str) -> str | None:
    """Look up an asset's MinIO storage key."""
    from sqlalchemy import text
    engine = _get_sync_conn()
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT storage_key FROM assets WHERE id = :id"),
                {"id": asset_id},
            ).fetchone()
    finally:
        engine.dispose()
    return row[0] if row else None


def _download_asset(asset_id: str, dest_dir) -> "Path":  # type: ignore[name-defined]
    """Download an asset's source file from the media bucket to dest_dir."""
    from pathlib import Path
    key = _asset_storage_key(asset_id)
    if not key:
        raise RuntimeError(f"Asset {asset_id} has no storage key.")
    dest = Path(dest_dir) / Path(key).name
    _s3_client().download_file(Bucket="viraedit-media", Key=key, Filename=str(dest))
    return dest


def _ffprobe_duration(path) -> float:
    """Return media duration in seconds via ffprobe, or 0.0."""
    import subprocess
    from config import settings
    try:
        out = subprocess.run(
            [settings.FFPROBE_PATH, "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            check=True, capture_output=True, text=True,
        )
        return float(out.stdout.strip() or 0.0)
    except Exception:
        return 0.0


# ── Filter / effect helpers ─────────────────────────────────────────────────

def _parse_css_filter(css: str) -> dict[str, float]:
    """Parse a CSS filter string like 'brightness(1.2) contrast(0.9)' into a dict."""
    import re
    result: dict[str, float] = {}
    for match in re.finditer(r"(\w+)\s*\(\s*([0-9.]+)\s*\)", css):
        name = match.group(1).lower()
        val = float(match.group(2))
        if name in ("brightness", "contrast", "saturate", "grayscale", "sepia"):
            result[name] = val
    return result


def _clip_effects_by_type(clip: dict, etype: str) -> list[dict]:
    """Return all effects of a given type from a clip's effects array."""
    effects = clip.get("effects") or []
    return [e for e in effects if isinstance(e, dict) and e.get("type") == etype]


def _visual_overlay_params(clip: dict) -> dict[str, Any]:
    params: dict[str, Any] = {}
    for eff in clip_effects_by_type(clip, "visual_overlay"):
        if isinstance(eff, dict):
            params.update(eff.get("params") or {})
    return params


def _ffmpeg_escape_drawtext(value: str) -> str:
    """Escape drawtext string payload for FFmpeg filter syntax."""
    return (
        value.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("%", "\\%")
        .replace("\n", "\\n")
    )


def _video_filter_string(
    clip: dict,
    width: int,
    height: int,
    timeline_data: dict | None = None,
) -> str:
    """Build the -vf filter chain for a single clip (scale+pad + speed + color + zoom)."""
    filters: list[str] = []
    filters.append(f"scale={width}:{height}:force_original_aspect_ratio=decrease")
    filters.append(f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2")
    filters.append("setsar=1")

    if timeline_data is not None:
        mid_t = (
            float(clip.get("timeline_start", 0))
            + float(clip.get("timeline_end", clip.get("timeline_start", 0)))
        ) / 2.0
        zoom = zoom_scale_at_time(timeline_data, mid_t)
        if abs(zoom - 1.0) > 0.02:
            zw = int(width * zoom)
            zh = int(height * zoom)
            filters.append(f"scale={zw}:{zh}")
            filters.append(f"crop={width}:{height}")

    speed = float(clip.get("speed", 1.0))
    if abs(speed - 1.0) > 0.01:
        filters.append(f"setpts=PTS/{speed}")

    # Color filter via CSS-like string → eq filter
    for eff in _clip_effects_by_type(clip, "color_filter"):
        params = eff.get("params") or {}
        css = str(params.get("css_filter", ""))
        if not css:
            continue
        parsed = _parse_css_filter(css)
        eq_parts: list[str] = []
        if "brightness" in parsed:
            eq_parts.append(f"brightness={(parsed['brightness'] - 1.0) * 0.5:.3f}")
        if "contrast" in parsed:
            eq_parts.append(f"contrast={parsed['contrast']:.3f}")
        if "saturate" in parsed:
            eq_parts.append(f"saturation={parsed['saturate']:.3f}")
        if eq_parts:
            filters.append("eq=" + ":".join(eq_parts))

    # Color grade (style transfer lookup) — approximate with eq controls.
    for eff in _clip_effects_by_type(clip, "color_grade"):
        params = eff.get("params") or {}
        brightness = float(params.get("brightness", 0.0))
        contrast = 1.0 + float(params.get("contrast", 0.0))
        saturation = 1.0 + float(params.get("saturation", 0.0))
        eq_parts = [
            f"brightness={max(-1.0, min(1.0, brightness)):.3f}",
            f"contrast={max(0.1, min(3.0, contrast)):.3f}",
            f"saturation={max(0.0, min(3.0, saturation)):.3f}",
        ]
        filters.append("eq=" + ":".join(eq_parts))

    return ",".join(filters)


def _speed_atempo(speed: float) -> list[str]:
    """Build atempo filter chain (atempo is limited to 0.5–2.0 range)."""
    atempos: list[str] = []
    remaining = speed
    while remaining < 0.5:
        atempos.append("atempo=0.5")
        remaining /= 0.5
    while remaining > 2.0:
        atempos.append("atempo=2.0")
        remaining /= 2.0
    if abs(remaining - 1.0) > 0.01:
        atempos.append(f"atempo={remaining:.4f}")
    return atempos


def _audio_filter_string(clip: dict) -> str | None:
    """Build -af filter chain for a clip's audio (mute, volume, speed)."""
    filters: list[str] = []

    if clip.get("muted", False):
        return "volume=0"

    speed = float(clip.get("speed", 1.0))
    filters.extend(_speed_atempo(speed))

    volume = float(clip.get("volume", 1.0))
    if abs(volume - 1.0) > 0.01:
        filters.append(f"volume={volume}")

    return ",".join(filters) if filters else None


# ── Track helpers ───────────────────────────────────────────────────────────

def _collect_track_clips(timeline_data: dict, *track_types: str) -> list[dict]:
    """Collect all clips from tracks matching the given type(s), sorted by timeline_start."""
    clips: list[dict] = []
    for track in timeline_data.get("tracks", []):
        ttype = (track.get("type") or "").lower()
        if ttype in track_types:
            for c in (track.get("clips") or []):
                if c.get("asset_id"):
                    clips.append(c)
    clips.sort(key=lambda c: float(c.get("timeline_start", 0.0)))
    return clips


def _download_assets(clips: list[dict], tmp_dir: "Path") -> dict[str, "Path"]:
    """Download unique source assets for all given clips."""
    from pathlib import Path
    asset_files: dict[str, Path] = {}
    for c in clips:
        cache_key = clip_cache_key(c)
        if not cache_key or cache_key in asset_files:
            continue
        try:
            path = _download_clip_source(c, tmp_dir)
            if path:
                asset_files[cache_key] = path
                aid = str(c.get("asset_id", "") or "")
                if aid:
                    asset_files[aid] = path
        except Exception:
            log.warning(
                "render_skip_download: cache_key=%s clip=%s",
                cache_key, c.get("id"),
            )
    return asset_files


# ── Audio mix (music + SFX + audio tracks) ─────────────────────────────────

def _render_audio_mix(
    tmp_dir: "Path",
    music_clips: list[dict],
    asset_files: dict[str, "Path"],
    total_duration: float,
    render_settings: dict,
) -> "Path | None":
    """
    Mix all music / SFX / audio clips into a single WAV file positioned at their
    correct timeline positions using adelay. Returns None when no clips to mix.
    """
    import subprocess
    from pathlib import Path
    from config import settings

    if not music_clips:
        return None

    abr = str(render_settings.get("audio_bitrate", "128k"))

    # Build filter complex: for each clip → atrim + volume + adelay → amix
    filter_parts: list[str] = []
    input_files: list[str] = []
    input_idx = 0
    adelay_ms: list[str] = []

    for clip in music_clips:
        aid = str(clip.get("asset_id", "") or "")
        cache_key = clip_cache_key(clip)
        src = asset_files.get(cache_key) or asset_files.get(aid)
        if not src:
            continue
        ss = float(clip.get("source_start", 0.0))
        to = float(clip.get("source_end", ss + 0.1))
        vol = float(clip.get("volume", 1.0))
        timeline_start = float(clip.get("timeline_start", 0.0))
        delay_ms_val = int(timeline_start * 1000)

        input_files.append(str(src))
        stream = f"[{input_idx}:a]"

        trim = f"atrim=start={ss}:end={to}"
        chain = f"{stream}{trim},volume={vol},adelay={delay_ms_val}|{delay_ms_val}"
        label = f"a{input_idx}"
        filter_parts.append(f"{chain}[{label}]")
        adelay_ms.append(f"[{label}]")
        input_idx += 1

    if input_idx == 0:
        return None

    # All inputs → amix
    mix_inputs = "".join(adelay_ms)
    filter_parts.append(f"{mix_inputs}amix=inputs={input_idx}:duration=longest:normalize=0[aout]")

    output = Path(tmp_dir) / "audio_mix.wav"
    cmd = [
        settings.FFMPEG_PATH, "-y",
    ]
    for inp in input_files:
        cmd.extend(["-i", inp])
    cmd.extend([
        "-filter_complex", "; ".join(filter_parts),
        "-map", "[aout]",
        "-c:a", "pcm_s16le",
        "-ar", "48000",
        "-ac", "2",
        str(output),
    ])

    log.info(
        "render_audio_mix: clips=%d inputs=%d",
        len(music_clips), input_idx,
    )
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=600)
    except subprocess.CalledProcessError as e:
        log.error("audio_mix_ffmpeg_failed: returncode=%d stderr=%s", e.returncode, e.stderr.decode("utf-8", errors="replace"))
        raise
    return output if output.exists() else None


def _composite_motion_graphics(
    overlay_clips: list[dict],
    video_path: "Path",
    output_path: "Path",
    width: int,
    height: int,
    video_duration: float,
    *,
    project_id: str | None = None,
    audio_storage_key: str | None = None,
) -> bool:
    """
    Step 5b — render pro motion graphics via Remotion and composite onto video.
    Non-fatal: returns False if no elements or Remotion unavailable.
    """
    import asyncio
    import shutil
    from services.motion_graphics_service import render_motion_graphics_for_timeline

    try:
        ok = asyncio.run(
            render_motion_graphics_for_timeline(
                overlay_clips,
                video_path=video_path.as_posix(),
                output_path=output_path.as_posix(),
                width=width,
                height=height,
                fps=30,
                video_duration=video_duration,
                project_id=project_id,
                audio_storage_key=audio_storage_key,
            )
        )
        if ok and output_path.exists():
            return True
    except Exception as exc:
        log.warning("render_motion_graphics_step_skipped: %s", exc)

    if video_path != output_path:
        shutil.copy2(video_path, output_path)
    return False


# ── Overlay compositing ────────────────────────────────────────────────────

def _composite_overlays(
    tmp_dir: "Path",
    video_path: "Path",
    overlay_clips: list[dict],
    asset_files: dict[str, "Path"],
    render_settings: dict,
    total_duration: float,
) -> "Path":
    """
    Composite overlay clips (b-roll, images) onto the video using overlay filter
    with enable='between(t,start,end)' for timeline positioning.
    """
    import subprocess
    from pathlib import Path
    from config import settings

    if not overlay_clips:
        return video_path

    width = int(render_settings.get("width", 1920))
    height = int(render_settings.get("height", 1080))

    filter_parts: list[str] = []
    overlay_inputs: list[Path] = []
    filter_parts.append("[0:v]null[base]")
    current_label = "base"

    for clip in overlay_clips:
        if not overlay_is_media_clip(clip):
            params = _visual_overlay_params(clip)
            visual_type = str(params.get("visual_type") or "").lower()
            # Pro motion graphics render via Remotion in step 5b — skip FFmpeg drawtext
            try:
                from services.motion_graphics_service import MOTION_GRAPHIC_TYPES as _MG_TYPES
                if visual_type in _MG_TYPES:
                    continue
            except ImportError:
                pass
            text = str(params.get("display_value") or clip.get("label") or "").strip()
            secondary = str(params.get("secondary_text") or "").strip()
            if not text and not secondary:
                continue
            tl_start = float(clip.get("timeline_start", 0.0))
            tl_end = float(clip.get("timeline_end", tl_start + 1.0))
            layout = overlay_layout(clip, width, height)
            x = int(layout["x"])
            y = int(layout["y"])
            next_label = f"txt{len(filter_parts)}"
            esc = _ffmpeg_escape_drawtext(text)
            primary_size = 64 if layout.get("mode") == "fullscreen" else 48
            filter_parts.append(
                f"[{current_label}]drawtext=text='{esc}':x={x}:y={y}:"
                f"fontsize={primary_size}:fontcolor=white:borderw=3:bordercolor=black:"
                f"enable='between(t,{tl_start:.4f},{tl_end:.4f})'[{next_label}]"
            )
            current_label = next_label
            if secondary:
                next2 = f"txt{len(filter_parts)}"
                esc2 = _ffmpeg_escape_drawtext(secondary)
                filter_parts.append(
                    f"[{current_label}]drawtext=text='{esc2}':x={x}:y={y + primary_size + 12}:"
                    f"fontsize={max(28, int(primary_size * 0.68))}:fontcolor=white:borderw=2:bordercolor=black:"
                    f"enable='between(t,{tl_start:.4f},{tl_end:.4f})'[{next2}]"
                )
                current_label = next2
            continue

        cache_key = clip_cache_key(clip)
        src = asset_files.get(cache_key) or asset_files.get(str(clip.get("asset_id", "")))
        if not src:
            log.warning("render_overlay_missing_source: clip=%s key=%s", clip.get("id"), cache_key)
            continue

        ss = float(clip.get("source_start", 0.0))
        to = float(clip.get("source_end", ss + 0.1))
        tl_start = float(clip.get("timeline_start", 0.0))
        tl_end = float(clip.get("timeline_end", tl_start + 1.0))

        layout = overlay_layout(clip, width, height)
        x = int(layout["x"])
        y = int(layout["y"])
        ow = int(layout["w"])
        oh = int(layout["h"])
        opacity = float(layout.get("opacity", 1.0))

        overlay_inputs.append(src)
        input_idx = len(overlay_inputs)

        trim_filter = f"trim=start={ss}:end={to},setpts=PTS-STARTPTS"
        if layout.get("mode") == "fullscreen":
            scale_filter = f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}"
        else:
            scale_filter = f"scale={ow}:{oh}:force_original_aspect_ratio=decrease"

        label = f"ov{input_idx}"
        chain = f"[{input_idx}:v]{trim_filter},{scale_filter}"
        if opacity < 0.99:
            chain += f",format=rgba,colorchannelmixer=aa={opacity:.3f}"
        filter_parts.append(f"{chain}[{label}]")

        enable = f"between(t,{tl_start:.4f},{tl_end:.4f})"
        next_label = f"v{input_idx}"
        filter_parts.append(
            f"[{current_label}][{label}]overlay=x={x}:y={y}:enable='{enable}'[{next_label}]"
        )
        current_label = next_label

    if not overlay_inputs:
        return video_path

    output = Path(tmp_dir) / "overlay_composited.mp4"
    cmd = [
        settings.FFMPEG_PATH, "-y",
        "-i", str(video_path),
    ]
    for inp in overlay_inputs:
        cmd.extend(["-i", str(inp)])
    cmd.extend([
        "-filter_complex", "; ".join(filter_parts),
        "-map", f"[{current_label}]",
        "-map", "0:a",
        "-c:v", "libx264", "-crf", str(render_settings.get("crf", 18)),
        "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-c:a", "copy",
        "-movflags", "+faststart",
        str(output),
    ])

    log.info(
        "render_overlay: clips=%d inputs=%d",
        len(overlay_clips), len(overlay_inputs),
    )
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=600)
    except subprocess.CalledProcessError as e:
        log.error("overlay_ffmpeg_failed: returncode=%d stderr=%s", e.returncode, e.stderr.decode("utf-8", errors="replace"))
        raise
    return output


def _transition_for_clip(clip: dict) -> tuple[str, float]:
    """Resolve FFmpeg xfade transition + duration from clip transition effect."""
    transition = "cut"
    duration = 0.0
    for eff in clip_effects_by_type(clip, "transition_out"):
        params = eff.get("params") or {}
        transition = str(params.get("type") or transition or "cut").lower()
        duration = float(params.get("duration") or duration or 0.0)
        break
    if transition in ("crossfade", "dissolve"):
        return "fade", max(0.0, duration)
    if transition in ("zoom", "zoom-in", "zoom_in"):
        return "zoomin", max(0.0, duration)
    if transition in ("slide", "whip-pan", "whip_pan"):
        return "slideleft", max(0.0, duration)
    if transition in ("fade",):
        return "fade", max(0.0, duration)
    return "fade", 0.0


def _concat_with_transitions(
    tmp: "Path",
    segments: list["Path"],
    video_clips: list[dict],
    crf: int,
) -> "Path":
    """Concatenate rendered segments with xfade/acrossfade transitions."""
    import subprocess
    from pathlib import Path
    from config import settings

    if len(segments) == 1:
        return segments[0]

    durations = [max(0.1, _ffprobe_duration(s)) for s in segments]
    transitions: list[tuple[str, float]] = []
    has_transition = False
    for i in range(len(segments) - 1):
        tname, req = _transition_for_clip(video_clips[i])
        max_allowed = max(0.0, min(durations[i], durations[i + 1]) - 0.08)
        d = min(req, max_allowed)
        if d >= 0.06:
            has_transition = True
        else:
            d = 0.001
            tname = "fade"
        transitions.append((tname, d))

    if not has_transition:
        concat_video = tmp / "concat_video.mp4"
        listfile = tmp / "concat.txt"
        listfile.write_text(
            "\n".join(f"file '{p.as_posix()}'" for p in segments), encoding="utf-8"
        )
        subprocess.run(
            [settings.FFMPEG_PATH, "-y", "-f", "concat", "-safe", "0",
             "-i", str(listfile), "-c", "copy", str(concat_video)],
            check=True, capture_output=True,
        )
        return concat_video

    filter_parts: list[str] = []
    current_v = "0:v"
    current_a = "0:a"
    current_len = durations[0]

    for i in range(1, len(segments)):
        tname, d = transitions[i - 1]
        offset = max(0.0, current_len - d)
        next_v = f"v{i}"
        next_a = f"a{i}"
        filter_parts.append(
            f"[{current_v}][{i}:v]xfade=transition={tname}:duration={d:.3f}:offset={offset:.3f}[{next_v}]"
        )
        filter_parts.append(
            f"[{current_a}][{i}:a]acrossfade=d={d:.3f}:c1=tri:c2=tri[{next_a}]"
        )
        current_v = next_v
        current_a = next_a
        current_len = current_len + durations[i] - d

    out = Path(tmp) / "concat_video.mp4"
    cmd = [settings.FFMPEG_PATH, "-y"]
    for seg in segments:
        cmd.extend(["-i", str(seg)])
    cmd.extend([
        "-filter_complex", "; ".join(filter_parts),
        "-map", f"[{current_v}]",
        "-map", f"[{current_a}]",
        "-c:v", "libx264",
        "-crf", str(crf),
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", "48000",
        "-ac", "2",
        "-movflags", "+faststart",
        str(out),
    ])
    subprocess.run(cmd, check=True, capture_output=True, timeout=900)
    return out


# ── Main render ─────────────────────────────────────────────────────────────

def _surface_director_fallback_warning(
    render_id: str,
    project_id: str,
    render_settings: dict,
) -> None:
    """Emit WebSocket + status update when export falls back to basic FFmpeg."""
    warning = render_settings.get("director_fallback_warning")
    if not warning:
        return
    log.error(
        "director_render_fallback_to_ffmpeg: project_id=%s render_id=%s detail=%s",
        project_id,
        render_id,
        render_settings.get("director_fallback_detail", ""),
    )
    try:
        from ws.publisher import emit_render_progress
        emit_render_progress(
            project_id,
            render_id,
            status="processing",
            progress_percent=18.0,
            message=warning,
        )
    except Exception:
        pass


def _record_director_fallback(
    render_settings: dict,
    *,
    project_id: str,
    step: str,
    exc: Exception,
) -> None:
    """Record a loud fallback reason before returning None to the FFmpeg path."""
    from services.director.render_precedence import FALLBACK_USER_MESSAGE

    detail = f"{step}: {exc}"
    render_settings["director_fallback_warning"] = FALLBACK_USER_MESSAGE
    render_settings["director_fallback_detail"] = detail
    render_settings["render_path"] = "legacy_ffmpeg_fallback"
    log.error(
        "director_render_path_failed: project_id=%s step=%s error=%s",
        project_id,
        step,
        exc,
        exc_info=True,
    )


def _load_compiled_director_timeline_sync(
    project_id: str,
) -> tuple[dict | None, str | None]:
    """Return (timeline_data, timeline_id) for the active compiled Director timeline."""
    from sqlalchemy import text

    engine = _get_sync_conn()
    try:
        with engine.begin() as conn:
            tl_row = conn.execute(
                text(
                    """
                    SELECT id, data FROM director_timelines
                    WHERE project_id = :pid AND is_active = true
                    ORDER BY version DESC LIMIT 1
                    """
                ),
                {"pid": project_id},
            ).fetchone()
    finally:
        engine.dispose()

    if not tl_row or not tl_row.data:
        return None, None
    return tl_row.data, str(tl_row.id)


def _render_unified_director_export(
    render_id: str,
    project_id: str,
    render_settings: dict,
    timeline_data: dict,
) -> tuple[str, float] | None:
    """
    Preview/Export Parity path — Director Timeline Primacy Law.

    IF compiled DirectorTimeline exists and useDirectorEngine is on:
        render it directly via DirectorRender + timelineToMotionPlan()
    ELSE:
        bridge the saved editor timeline (legacy fallback only)

    Returns None (with fallback recorded on render_settings) so FFmpeg can run.
    """
    import asyncio
    import tempfile
    from pathlib import Path
    from sqlalchemy import text

    from services.director.legacy_timeline_bridge import bridge_editor_timeline_to_director
    from services.director.render_precedence import should_use_compiled_director_timeline

    width = int(render_settings.get("width", 1920))
    height = int(render_settings.get("height", 1080))

    engine = _get_sync_conn()
    project_settings: dict = {}
    content_type = "podcast"
    try:
        with engine.begin() as conn:
            project_row = conn.execute(
                text("SELECT settings, content_type FROM projects WHERE id = :id"),
                {"id": project_id},
            ).fetchone()
            if project_row:
                project_settings = project_row.settings or {}
                if project_row.content_type:
                    content_type = str(
                        project_row.content_type.value
                        if hasattr(project_row.content_type, "value")
                        else project_row.content_type
                    ).lower()
                    if content_type not in ("podcast", "consultancy", "social", "showcase"):
                        content_type = "podcast"

            asset_rows = conn.execute(
                text(
                    """
                    SELECT id, storage_key, original_filename
                    FROM assets WHERE project_id = :pid ORDER BY created_at ASC
                    """
                ),
                {"pid": project_id},
            ).fetchall()
    finally:
        engine.dispose()

    from processors.storage_helpers import S3Storage

    storage = S3Storage()
    asset_urls: dict[str, str] = {}
    primary_video_src: str | None = None
    for row in asset_rows:
        url = storage.get_presigned_url(row.storage_key, filename=row.original_filename)
        asset_urls[str(row.id)] = url
        if primary_video_src is None:
            primary_video_src = url

    camera_feeds = project_settings.get("cameraFeeds") or []
    compiled, compiled_id = _load_compiled_director_timeline_sync(project_id)
    use_compiled = should_use_compiled_director_timeline(
        settings=project_settings,
        compiled_timeline=compiled,
    )
    burn_editor_captions = not use_compiled

    if use_compiled:
        director_timeline = compiled
        render_source = "compiled_director_timeline"
        log.info(
            "unified_director_source_compiled",
            project_id=project_id,
            timeline_id=compiled_id,
        )
    else:
        theme = (timeline_data.get("metadata") or {}).get("theme")
        try:
            director_timeline = asyncio.run(
                bridge_editor_timeline_to_director(
                    timeline_data,
                    project_id=project_id,
                    width=width,
                    height=height,
                    content_type=content_type,
                    theme=theme if isinstance(theme, dict) else None,
                )
            )
        except Exception as exc:
            _record_director_fallback(
                render_settings,
                project_id=project_id,
                step="bridge_editor_timeline",
                exc=exc,
            )
            return None
        render_source = "bridged_editor_timeline"
        log.info(
            "unified_director_source_bridge",
            project_id=project_id,
            has_compiled=compiled is not None,
        )

    if not director_timeline.get("tracks", {}).get("video"):
        log.info("unified_director_skipped_no_video", project_id=project_id)
        _record_director_fallback(
            render_settings,
            project_id=project_id,
            step="validate_video_tracks",
            exc=RuntimeError("Director timeline has no video clips to render."),
        )
        return None

    with tempfile.TemporaryDirectory(prefix="viraedit_unified_render_") as tmp_dir:
        tmp = Path(tmp_dir)
        out = tmp / "director_export.mp4"
        _update_render_status(render_id, "processing", progress=40.0)

        from processors.remotion_client import render_director_export, remotion_service_healthy

        if not asyncio.run(remotion_service_healthy()):
            _record_director_fallback(
                render_settings,
                project_id=project_id,
                step="remotion_health_check",
                exc=RuntimeError("Remotion service is not reachable."),
            )
            return None

        render_settings["asset_urls"] = asset_urls
        render_settings["primary_video_src"] = primary_video_src
        render_settings["camera_feeds"] = camera_feeds
        render_settings["fps"] = director_timeline.get("fps", 30)

        from services.render.plan_render_segments import plan_render_segments

        planned = plan_render_segments(director_timeline)
        if len(planned) > 1:
            try:
                from tasks.chunked_render_tasks import dispatch_chunked_director_render

                storage_key, duration = dispatch_chunked_director_render(
                    render_id,
                    project_id,
                    director_timeline,
                    render_settings,
                )
                render_settings["render_path"] = "chunked_director_export"
                log.info(
                    "chunked_director_render_complete",
                    project_id=project_id,
                    segments=len(planned),
                    storage_key=storage_key,
                )
                return storage_key, duration
            except Exception as exc:
                log.warning(
                    "chunked_director_render_failed_fallback_single",
                    project_id=project_id,
                    error=str(exc),
                )

        try:
            asyncio.run(
                render_director_export(
                    director_timeline,
                    output_path=out.as_posix(),
                    asset_urls=asset_urls,
                    primary_video_src=primary_video_src,
                    dialogue_src=primary_video_src,
                    camera_feeds=camera_feeds,
                )
            )
        except Exception as exc:
            _record_director_fallback(
                render_settings,
                project_id=project_id,
                step="render_director_export",
                exc=exc,
            )
            return None

        _update_render_status(render_id, "processing", progress=88.0)
        if burn_editor_captions:
            final_out, duration = _maybe_burn_timeline_captions(
                out, timeline_data, tmp, render_id,
            )
        else:
            final_out, duration = out, _ffprobe_duration(out)
        duration = _ffprobe_duration(final_out) if duration <= 0 else duration

        _update_render_status(render_id, "processing", progress=90.0)
        storage_key = (
            f"renders/{project_id}/{render_settings.get('platform', 'youtube')}"
            f"/{render_id[:8]}/output.mp4"
        )
        _s3_client().upload_file(
            Filename=str(final_out),
            Bucket="viraedit-renders",
            Key=storage_key,
            ExtraArgs={"ContentType": "video/mp4"},
        )
        render_settings["render_path"] = render_source
        log.info(
            "unified_director_render_complete",
            project_id=project_id,
            storage_key=storage_key,
            render_source=render_source,
            motion_graphics=len(
                director_timeline.get("tracks", {}).get("motionGraphics", [])
            ),
            vfx=len(director_timeline.get("tracks", {}).get("vfx", [])),
        )
        return storage_key, duration


def _real_render(
    render_id: str,
    project_id: str,
    platform: str,
    render_settings: dict,
    timeline_data: dict,
) -> tuple[str, float]:
    """
    Full render pipeline — composites all timeline elements into a single MP4.

    Pipeline:
      1. Render each video clip (trim + scale + speed + color effects)
      2. Concatenate video segments → video_with_main_audio.mp4
      3. Build audio mix from music / SFX / audio tracks → audio_mix.wav
      4. Mix main audio with audio mix → mixed.mp4
      5. Composite overlays (b-roll, images) → composited.mp4
      6. Burn captions → captioned_export.mp4
      7. Upload final video to renders bucket
    """
    import shutil
    import subprocess
    import tempfile
    from pathlib import Path
    from config import settings

    width  = int(render_settings["width"])
    height = int(render_settings["height"])
    crf    = int(render_settings["crf"])
    abr    = str(render_settings["audio_bitrate"])

    # Collect clips by track type
    log_render_plan(timeline_data)
    video_clips    = collect_render_clips(timeline_data, "video")
    music_clips    = collect_render_clips(timeline_data, "music")
    audio_clips    = collect_render_clips(timeline_data, "audio")
    overlay_clips  = collect_render_clips(timeline_data, "overlay")

    if not video_clips:
        raise RuntimeError("Timeline has no video clips to render.")

    total_duration = float(timeline_data.get("global_settings", {}).get("duration", 0))
    if total_duration <= 0:
        for c in video_clips:
            end = float(c.get("timeline_end", 0))
            if end > total_duration:
                total_duration = end

    with tempfile.TemporaryDirectory(prefix="viraedit_render_") as tmp_dir:
        tmp = Path(tmp_dir)

        # Download all unique source assets
        all_clips = video_clips + music_clips + audio_clips + overlay_clips
        asset_files = _download_assets(all_clips, tmp)

        # ── Step 1: Render each video clip with effects ──────────────────
        segments: list[Path] = []
        for i, c in enumerate(video_clips):
            cache_key = clip_cache_key(c)
            src = asset_files.get(cache_key) or asset_files.get(str(c.get("asset_id", "")))
            if not src:
                log.warning("render_skip_clip: missing asset clip=%s key=%s", c.get("id"), cache_key)
                continue
            ss = float(c.get("source_start", 0.0))
            to = float(c.get("source_end", 0.0))
            seg = tmp / f"seg{i}.mp4"

            vf = _video_filter_string(c, width, height, timeline_data)
            af = _audio_filter_string(c)

            cmd = [
                settings.FFMPEG_PATH, "-y",
                "-ss", str(ss), "-to", str(to), "-i", str(src),
                "-vf", vf, "-r", "30",
                "-c:v", "libx264", "-crf", str(crf), "-preset", "veryfast", "-pix_fmt", "yuv420p",
            ]
            if af:
                cmd.extend(["-af", af])
            cmd.extend([
                "-c:a", "aac", "-b:a", abr, "-ar", "48000", "-ac", "2",
                str(seg),
            ])
            subprocess.run(cmd, check=True, capture_output=True)
            segments.append(seg)
            _update_render_status(
                render_id, "processing",
                progress=10.0 + (i + 1) / len(video_clips) * 50.0,
            )

        if not segments:
            raise RuntimeError("No video segments could be rendered.")

        # ── Step 2: Concatenate video segments ───────────────────────────
        concat_video = _concat_with_transitions(tmp, segments, video_clips, crf)

        current_output = concat_video
        _update_render_status(render_id, "processing", progress=65.0)

        # ── Step 3: Build audio mix (music + SFX + audio tracks) ─────────
        all_music_sfx = music_clips + audio_clips
        audio_mix = _render_audio_mix(
            tmp, all_music_sfx, asset_files, total_duration, render_settings,
        )

        # ── Step 4: Mix main audio with overlay audio ────────────────────
        if audio_mix:
            mixed = tmp / "audio_mixed.mp4"
            duck_music = any(_music_clip_needs_ducking(c) for c in music_clips)
            if duck_music:
                music_vol = float(music_clips[0].get("volume", 0.2)) if music_clips else 0.2
                _mix_audio_with_ducking(current_output, audio_mix, mixed, music_vol)
            else:
                cmd = [
                    settings.FFMPEG_PATH, "-y",
                    "-i", str(current_output),
                    "-i", str(audio_mix),
                    "-filter_complex",
                    "[0:a][1:a]amix=inputs=2:duration=first:normalize=0[a]",
                    "-map", "0:v",
                    "-map", "[a]",
                    "-c:v", "copy",
                    "-c:a", "aac", "-b:a", abr, "-ar", "48000", "-ac", "2",
                    "-movflags", "+faststart",
                    str(mixed),
                ]
                subprocess.run(cmd, check=True, capture_output=True, timeout=600)
            current_output = mixed
            _update_render_status(render_id, "processing", progress=78.0)

        # ── Step 5: Composite overlays ───────────────────────────────────
        if overlay_clips:
            composited = _composite_overlays(
                tmp, current_output, overlay_clips, asset_files,
                render_settings, total_duration,
            )
            current_output = composited
            _update_render_status(render_id, "processing", progress=86.0)

        # ── Step 5b: Motion graphics (Remotion overlay composite) ──────────
        mg_output = tmp / "motion_graphics_composited.mp4"
        primary_audio_key: str | None = None
        if video_clips:
            aid = str(video_clips[0].get("asset_id") or "")
            if aid:
                primary_audio_key = _asset_storage_key(aid)
        if _composite_motion_graphics(
            overlay_clips, current_output, mg_output,
            width, height, total_duration,
            project_id=project_id,
            audio_storage_key=primary_audio_key,
        ):
            current_output = mg_output
            _update_render_status(render_id, "processing", progress=88.0)

        # ── Step 6: Apply final faststart ────────────────────────────────
        if current_output != concat_video:
            final = tmp / "final_output.mp4"
            subprocess.run(
                [settings.FFMPEG_PATH, "-y", "-i", str(current_output),
                 "-c", "copy", "-movflags", "+faststart", str(final)],
                check=True, capture_output=True,
            )
            current_output = final

        _update_render_status(render_id, "processing", progress=90.0)

        # ── Step 7: Burn captions ────────────────────────────────────────
        duration = _ffprobe_duration(current_output)
        current_output, duration = _maybe_burn_timeline_captions(
            current_output, timeline_data, tmp, render_id,
        )
        duration = _ffprobe_duration(current_output) if duration <= 0 else duration
        _update_render_status(render_id, "processing", progress=95.0)

        # ── Upload to renders bucket ─────────────────────────────────────
        storage_key = f"renders/{project_id}/{platform}/{render_id[:8]}/output.mp4"
        _s3_client().upload_file(
            Filename=str(current_output),
            Bucket="viraedit-renders",
            Key=storage_key,
            ExtraArgs={"ContentType": "video/mp4"},
        )

        log.info(
            "render_ffmpeg_complete: key=%s video_clips=%d music_clips=%d "
            "overlay_clips=%d duration=%.1fs",
            storage_key, len(video_clips), len(music_clips) + len(audio_clips),
            len(overlay_clips), duration,
        )
        return storage_key, duration


def _caption_words_from_timeline(timeline_data: dict) -> list[dict]:
    """Build caption segments from saved timeline caption clips."""
    def _has_word_by_word_fx() -> bool:
        meta = timeline_data.get("metadata") or {}
        fx = meta.get("caption_fx")
        if isinstance(fx, dict) and str(fx.get("animation") or "").lower() == "word-by-word":
            return True
        for track in timeline_data.get("tracks", []):
            if (track.get("type") or "").lower() != "effects":
                continue
            for clip in track.get("clips") or []:
                for eff in clip.get("effects") or []:
                    if not isinstance(eff, dict) or eff.get("type") != "caption_style":
                        continue
                    params = eff.get("params") or {}
                    if str(params.get("animation") or "").lower() == "word-by-word":
                        return True
        return False

    word_by_word = _has_word_by_word_fx()
    words: list[dict] = []
    for track in timeline_data.get("tracks", []):
        if (track.get("type") or "").lower() != "captions":
            continue
        clips = sorted(
            track.get("clips", []),
            key=lambda c: float(c.get("timeline_start", 0.0)),
        )
        for clip in clips:
            start = float(clip.get("timeline_start", 0.0))
            end = float(clip.get("timeline_end", start + 0.1))
            text = (clip.get("label") or "").strip()
            for eff in clip.get("effects") or []:
                if isinstance(eff, dict) and eff.get("type") == "caption":
                    params = eff.get("params") or {}
                    text = str(params.get("text") or text).strip()
            if not text or end <= start + 0.02:
                continue
            if word_by_word:
                parts = [p for p in text.split() if p.strip()]
                if len(parts) > 1:
                    total = end - start
                    step = total / float(len(parts))
                    for idx, part in enumerate(parts):
                        w_start = start + step * idx
                        w_end = end if idx == len(parts) - 1 else (w_start + step)
                        words.append({"word": part, "start": w_start, "end": w_end})
                    continue
            words.append({"word": text, "start": start, "end": end})
    return words


def _resolve_caption_burn_style(timeline_data: dict) -> str:
    from processors.caption_renderer import CAPTION_STYLE_NAMES

    meta = timeline_data.get("metadata") or {}

    # Always respect the explicit caption_burn_style — overrides are applied
    # on top via merge_caption_preset() in render_captions.
    style = meta.get("caption_burn_style")
    if isinstance(style, str) and style in CAPTION_STYLE_NAMES:
        return style

    preset = str(meta.get("caption_editor_preset") or "")
    mapping = {
        "nepali-bold": "nepali_bold",
        "subtitle": "minimal",
        "tiktok": "mrbeast",
        "bilingual": "nepali_bold",
    }
    return mapping.get(preset, "nepali_bold")


def _maybe_burn_timeline_captions(
    output_path,
    timeline_data: dict,
    tmp_dir,
    render_id: str,
) -> tuple:
    """Burn ASS captions onto the rendered MP4 when the timeline has caption clips."""
    from pathlib import Path
    from processors.caption_renderer import render_captions

    words = _caption_words_from_timeline(timeline_data)
    if not words:
        return output_path, _ffprobe_duration(output_path)

    style = _resolve_caption_burn_style(timeline_data)
    style_overrides = caption_style_from_metadata(timeline_data)
    log_caption_preview_vs_render(timeline_data, style_overrides)
    out = Path(tmp_dir) / "captioned_export.mp4"
    log.info(
        "render_burn_captions: segments=%d style=%s overrides=%s",
        len(words),
        style,
        list(style_overrides.keys()),
    )
    _update_render_status(render_id, "processing", progress=92.0)
    render_captions(output_path, out, words, style=style, style_overrides=style_overrides)
    return out, _ffprobe_duration(out)


def _render_director_styled_short(
    render_id: str,
    project_id: str,
    platform: str,
    stored_settings: dict,
    render_settings: dict,
) -> tuple[str, float] | None:
    """
    Director-styled Short export — reframe → compile once → render-director per platform.
    """
    import asyncio

    from processors.remotion_client import remotion_service_healthy
    from services.director.styled_shorts_pipeline import (
        platforms_from_scores,
        run_styled_short_pipeline_sync,
    )

    asset_id = str(stored_settings.get("asset_id", "") or "")
    start_time = float(stored_settings.get("start_time", 0.0))
    end_time = float(stored_settings.get("end_time", 0.0))
    if not asset_id or end_time <= start_time:
        log.warning(
            "director_styled_short_skipped_invalid_window",
            render_id=render_id,
            asset_id=asset_id,
        )
        return None

    if not asyncio.run(remotion_service_healthy()):
        _record_director_fallback(
            render_settings,
            project_id=project_id,
            step="remotion_health_check",
            exc=RuntimeError("Remotion service is not reachable."),
        )
        return None

    platforms: list[str] = list(stored_settings.get("platforms") or [])
    if not platforms:
        if stored_settings.get("render_all_scored_platforms"):
            platforms = platforms_from_scores(stored_settings.get("platform_scores"))
        else:
            platforms = [platform]

    _update_render_status(render_id, "processing", progress=25.0)

    try:
        base_timeline, outputs, reframed = run_styled_short_pipeline_sync(
            project_id=project_id,
            asset_id=asset_id,
            start_time=start_time,
            end_time=end_time,
            platforms=platforms,
            hook=stored_settings.get("hook"),
            viral_score=stored_settings.get("viral_score"),
            upload_prefix=f"renders/shorts/{asset_id}/{render_id[:8]}",
            ffprobe_duration=_ffprobe_duration,
        )
    except Exception as exc:
        log.warning(
            "director_styled_short_pipeline_failed",
            render_id=render_id,
            error=str(exc),
            exc_info=True,
        )
        _record_director_fallback(
            render_settings,
            project_id=project_id,
            step="styled_short_pipeline",
            exc=exc,
        )
        return None

    primary = next(
        (o for o in outputs if o.platform == platform or platform in o.platform),
        outputs[0],
    )

    render_settings["director_styled"] = True
    render_settings["render_source"] = "director_styled_short"
    render_settings["compiled_timeline_id"] = base_timeline.get("projectId")
    render_settings["reframe_warning"] = reframed.warning
    render_settings["platform_outputs"] = {
        o.platform: {
            "storage_key": o.storage_key,
            "duration_seconds": o.duration_seconds,
            "variant_key": o.variant_key,
        }
        for o in outputs
    }

    _update_render_status(render_id, "processing", progress=92.0)
    log.info(
        "director_styled_short_complete: asset=%s platforms=%s primary=%s",
        asset_id,
        [o.platform for o in outputs],
        primary.storage_key,
    )
    return primary.storage_key, primary.duration_seconds


def _render_short_clip(
    render_id: str,
    asset_id: str,
    start_time: float,
    end_time: float,
    render_settings: dict,
) -> tuple[str, float]:
    """
    Export a trimmed short from one source asset.
    Supports multi-segment topic compilations via render_settings.segments[].
    """
    import subprocess
    import tempfile
    from pathlib import Path
    from config import settings

    segments = render_settings.get("segments") or []
    if segments and isinstance(segments, list) and len(segments) > 1:
        return _render_short_clip_multi(render_id, asset_id, segments, render_settings)

    if not asset_id:
        raise RuntimeError("Short render is missing asset_id.")
    if end_time <= start_time:
        raise RuntimeError("Short render end_time must be after start_time.")

    width = int(render_settings["width"])
    height = int(render_settings["height"])
    crf = int(render_settings["crf"])
    abr = str(render_settings["audio_bitrate"])
    pan_x = float(render_settings.get("pan_x", 0.5))
    short_styling = render_settings.get("short_styling") or {}

    from tasks.shorts_engine import build_short_video_filter, short_speed_multiplier
    speed = short_speed_multiplier(short_styling)
    vf = build_short_video_filter(pan_x, width, height, short_styling)
    if abs(speed - 1.0) > 0.01:
        vf = f"{vf},setpts=PTS/{speed}"

    with tempfile.TemporaryDirectory(prefix="viraedit_short_") as tmp_dir:
        tmp = Path(tmp_dir)
        src = _download_asset(asset_id, tmp)
        output = tmp / "short.mp4"
        audio_filters: list[str] = []
        if abs(speed - 1.0) > 0.01:
            remaining = speed
            while remaining < 0.5:
                audio_filters.append("atempo=0.5")
                remaining /= 0.5
            while remaining > 2.0:
                audio_filters.append("atempo=2.0")
                remaining /= 2.0
            if abs(remaining - 1.0) > 0.01:
                audio_filters.append(f"atempo={remaining:.4f}")

        cmd = [
            settings.FFMPEG_PATH, "-y",
            "-ss", str(start_time), "-to", str(end_time), "-i", str(src),
            "-vf", vf, "-r", "30",
            "-c:v", "libx264", "-crf", str(crf), "-preset", "veryfast", "-pix_fmt", "yuv420p",
        ]
        if audio_filters:
            cmd.extend(["-af", ",".join(audio_filters)])
        cmd.extend([
            "-c:a", "aac", "-b:a", abr, "-ar", "48000", "-ac", "2",
            "-movflags", "+faststart",
            str(output),
        ])
        subprocess.run(cmd, check=True, capture_output=True)
        _update_render_status(render_id, "processing", progress=88.0)

        duration = _ffprobe_duration(output)
        storage_key = f"renders/shorts/{asset_id}/{render_id[:8]}/output.mp4"
        _s3_client().upload_file(
            Filename=str(output),
            Bucket="viraedit-renders",
            Key=storage_key,
            ExtraArgs={"ContentType": "video/mp4"},
        )
        log.info(
            "short_clip_render_complete: asset=%s %.2f-%.2f dur=%.1fs key=%s",
            asset_id, start_time, end_time, duration, storage_key,
        )
        return storage_key, duration


def _render_short_clip_multi(
    render_id: str,
    asset_id: str,
    segments: list,
    render_settings: dict,
) -> tuple[str, float]:
    """Concat multiple trimmed segments into one vertical short."""
    import subprocess
    import tempfile
    from pathlib import Path
    from config import settings

    width = int(render_settings["width"])
    height = int(render_settings["height"])
    crf = int(render_settings["crf"])
    abr = str(render_settings["audio_bitrate"])
    pan_x = float(render_settings.get("pan_x", 0.5))
    short_styling = render_settings.get("short_styling") or {}

    from tasks.shorts_engine import build_short_video_filter, short_speed_multiplier
    speed = short_speed_multiplier(short_styling)
    vf = build_short_video_filter(pan_x, width, height, short_styling)
    if abs(speed - 1.0) > 0.01:
        vf = f"{vf},setpts=PTS/{speed}"

    with tempfile.TemporaryDirectory(prefix="viraedit_short_multi_") as tmp_dir:
        tmp = Path(tmp_dir)
        src = _download_asset(asset_id, tmp)
        part_files: list[Path] = []

        for i, seg in enumerate(segments):
            st = float(seg.get("start_time", seg.get("start", 0)))
            en = float(seg.get("end_time", seg.get("end", st + 1)))
            if en <= st:
                continue
            part = tmp / f"part_{i:02d}.mp4"
            cmd = [
                settings.FFMPEG_PATH, "-y",
                "-ss", str(st), "-to", str(en), "-i", str(src),
                "-vf", vf, "-r", "30",
                "-c:v", "libx264", "-crf", str(crf), "-preset", "veryfast", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", abr, "-ar", "48000", "-ac", "2",
                str(part),
            ]
            subprocess.run(cmd, check=True, capture_output=True)
            part_files.append(part)
            _update_render_status(render_id, "processing", progress=40.0 + i * 8)

        if not part_files:
            raise RuntimeError("No valid segments to render for topic short.")

        output = tmp / "short.mp4"
        if len(part_files) == 1:
            part_files[0].rename(output)
        else:
            concat_list = tmp / "concat.txt"
            concat_list.write_text(
                "\n".join(f"file '{p.as_posix()}'" for p in part_files),
                encoding="utf-8",
            )
            subprocess.run([
                settings.FFMPEG_PATH, "-y",
                "-f", "concat", "-safe", "0", "-i", str(concat_list),
                "-c", "copy", "-movflags", "+faststart",
                str(output),
            ], check=True, capture_output=True)

        duration = _ffprobe_duration(output)
        storage_key = f"renders/shorts/{asset_id}/{render_id[:8]}/output.mp4"
        _s3_client().upload_file(
            Filename=str(output),
            Bucket="viraedit-renders",
            Key=storage_key,
            ExtraArgs={"ContentType": "video/mp4"},
        )
        log.info(
            "short_clip_multi_render_complete: asset=%s parts=%d dur=%.1fs",
            asset_id, len(part_files), duration,
        )
        return storage_key, duration
