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

from celery_app import celery_app

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
        timeline_data = _load_timeline(project_id)
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
            storage_key, out_duration = _render_short_clip(
                render_id,
                str(stored_settings.get("asset_id", "")),
                float(stored_settings.get("start_time", 0.0)),
                float(stored_settings.get("end_time", 0.0)),
                render_settings,
            )
        else:
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


def _load_timeline(project_id: str) -> dict | None:
    """Load the active timeline data for a project."""
    from sqlalchemy import text
    engine = _get_sync_conn()
    with engine.connect() as conn:
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


def _video_filter_string(clip: dict, width: int, height: int) -> str:
    """Build the -vf filter chain for a single clip (scale+pad + speed + color)."""
    filters: list[str] = []
    filters.append(f"scale={width}:{height}:force_original_aspect_ratio=decrease")
    filters.append(f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2")
    filters.append("setsar=1")

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

    # Color grade (style transfer lookup) — approximated via colorbalance
    for eff in _clip_effects_by_type(clip, "color_grade"):
        params = eff.get("params") or {}
        shadows = params.get("shadows") or {}
        midtones = params.get("midtones") or {}
        highlights = params.get("highlights") or {}
        cb_parts: list[str] = []
        for region, prefix in [(shadows, "rs"), (midtones, "gs"), (highlights, "bs")]:
            r = region.get("r", 0)
            g = region.get("g", 0)
            b = region.get("b", 0)
            if any(abs(v) > 0.01 for v in (r, g, b)):
                cb_parts.append(f"{prefix}={r:.3f}={g:.3f}={b:.3f}")
        if cb_parts:
            filters.append("colorbalance=" + ":".join(cb_parts))

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
        aid = c["asset_id"]
        if aid and aid not in asset_files:
            asset_files[aid] = _download_asset(aid, tmp_dir)
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
        src = asset_files.get(clip["asset_id"])
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

    # Build filter complex with one overlay per clip
    filter_parts: list[str] = []
    overlay_inputs: list[Path] = []
    # Map main video input to [base] label so overlay filters can reference it
    filter_parts.append("[0:v]null[base]")
    current_label = "base"

    for clip in overlay_clips:
        src = asset_files.get(clip["asset_id"])
        if not src:
            continue

        ss = float(clip.get("source_start", 0.0))
        to = float(clip.get("source_end", ss + 0.1))
        tl_start = float(clip.get("timeline_start", 0.0))
        tl_end = float(clip.get("timeline_end", tl_start + 1.0))
        dur = tl_end - tl_start

        # Position from effects if available
        x = 0
        y = 0
        for eff in _clip_effects_by_type(clip, "visual_overlay"):
            params = eff.get("params") or {}
            x_pct = params.get("x_pct", 50)
            y_pct = params.get("y_pct", 50)
            x = int((x_pct / 100.0) * width - width * 0.15)
            y = int((y_pct / 100.0) * height - height * 0.15)

        overlay_inputs.append(src)
        input_idx = len(overlay_inputs)  # 1-based: 1, 2, 3...

        # Trim to source range + scale to reasonable size (max 30% of output)
        scale_w = int(width * 0.3)
        scale_h = int(height * 0.3)
        trim_filter = f"trim=start={ss}:end={to},setpts=PTS-STARTPTS"
        scale_filter = f"scale='min({scale_w},iw)':'min({scale_h},ih)':force_original_aspect_ratio=decrease"

        label = f"ov{input_idx}"
        filter_parts.append(
            f"[{input_idx}:v]{trim_filter},{scale_filter}[{label}]"
        )

        # Overlay base with this overlay
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


# ── Main render ─────────────────────────────────────────────────────────────

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
    video_clips    = _collect_track_clips(timeline_data, "video")
    music_clips    = _collect_track_clips(timeline_data, "music")
    audio_clips    = _collect_track_clips(timeline_data, "audio")
    overlay_clips  = _collect_track_clips(timeline_data, "overlay")

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
            src = asset_files.get(c["asset_id"])
            if not src:
                log.warning("render_skip_clip: missing asset %s", c.get("asset_id"))
                continue
            ss = float(c.get("source_start", 0.0))
            to = float(c.get("source_end", 0.0))
            seg = tmp / f"seg{i}.mp4"

            vf = _video_filter_string(c, width, height)
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
        concat_video = tmp / "concat_video.mp4"
        if len(segments) == 1:
            shutil.copy(segments[0], concat_video)
        else:
            listfile = tmp / "concat.txt"
            listfile.write_text(
                "\n".join(f"file '{p.as_posix()}'" for p in segments), encoding="utf-8"
            )
            subprocess.run(
                [settings.FFMPEG_PATH, "-y", "-f", "concat", "-safe", "0",
                 "-i", str(listfile), "-c", "copy", str(concat_video)],
                check=True, capture_output=True,
            )

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
            words.append({"word": text, "start": start, "end": end})
    return words


def _resolve_caption_burn_style(timeline_data: dict) -> str:
    from processors.caption_renderer import CAPTION_STYLE_NAMES

    meta = timeline_data.get("metadata") or {}
    style = meta.get("caption_burn_style") or meta.get("caption_style")
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
    out = Path(tmp_dir) / "captioned_export.mp4"
    log.info(
        "render_burn_captions: segments=%d style=%s",
        len(words),
        style,
    )
    _update_render_status(render_id, "processing", progress=92.0)
    render_captions(output_path, out, words, style=style)
    return out, _ffprobe_duration(out)


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
