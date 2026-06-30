"""
ViraEdit — Assemble final video from style template + resolved assets (Phase 06).
"""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

import structlog

from config import settings

log = structlog.get_logger("viraedit.template_renderer")
from processors.music_library import pick_music_for_audio_profile, should_duck_for_speech
from processors.sizzle_assembler import add_background_music
from processors.text_editor import get_duration
from processors.storage_helpers import storage_sync

VERTICAL_FILTER = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"


def _storage_key(asset_info: dict[str, Any]) -> str:
    key = asset_info.get("storage_key") or asset_info.get("storageKey") or ""
    if not key:
        raise ValueError("Resolved asset is missing a storage key.")
    return str(key)


def _text_window_in_assembled(
    text_slot: dict[str, Any],
    video_slots: list[dict[str, Any]],
    part_durations: list[float],
) -> tuple[float, float] | None:
    """Map template text timing onto the concatenated timeline."""
    offset = 0.0
    text_start = float(text_slot.get("start", 0))
    text_end = float(text_slot.get("end", text_start))

    for video_slot, part_duration in zip(video_slots, part_durations):
        slot_start = float(video_slot.get("start", 0))
        slot_end = float(video_slot.get("end", slot_start))
        if text_start < slot_end and text_end > slot_start:
            local_start = offset + max(0.0, text_start - slot_start)
            local_end = offset + min(part_duration, text_end - slot_start)
            if local_end > local_start:
                return local_start, local_end
        offset += part_duration
    return None


def _escape_drawtext(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace(":", "\\:")
        .replace("%", "\\%")
    )


def render_video_from_template(
    template: dict[str, Any],
    resolved_assets: dict[str, Any],
    text_values: dict[str, str],
    work_dir: str | Path,
) -> str:
    """
    Trim/scale resolved assets, concatenate in slot order, burn text overlays.
    Returns path to the assembled video.
    """
    work = Path(work_dir)
    work.mkdir(parents=True, exist_ok=True)

    video_slots = sorted(
        [
            slot for slot in template.get("slots", [])
            if slot.get("type") in ("video_placeholder", "image_placeholder")
        ],
        key=lambda slot: float(slot.get("start", 0)),
    )
    if not video_slots:
        raise ValueError("Template has no video or image slots to render.")

    part_paths: list[Path] = []
    part_durations: list[float] = []
    temp_downloads: list[Path] = []

    try:
        for slot in video_slots:
            slot_id = str(slot["slot_id"])
            asset_info = resolved_assets.get(slot_id)
            if not asset_info:
                raise ValueError(f"Slot {slot_id} has no resolved asset — cannot render.")

            local_asset = Path(
                storage_sync.download_to_temp(_storage_key(asset_info), f"render_{slot_id}")
            )
            temp_downloads.append(local_asset)

            target_duration = max(0.1, float(slot["end"]) - float(slot["start"]))
            part_path = work / f"part_{slot_id}.mp4"

            if slot.get("type") == "image_placeholder":
                subprocess.run(
                    [
                        settings.FFMPEG_PATH,
                        "-loop", "1",
                        "-i", local_asset.as_posix(),
                        "-t", str(target_duration),
                        "-vf", VERTICAL_FILTER,
                        "-c:v", "libx264",
                        "-pix_fmt", "yuv420p",
                        "-an",
                        "-movflags", "+faststart",
                        part_path.as_posix(),
                        "-y",
                    ],
                    check=True,
                    capture_output=True,
                )
                part_duration = target_duration
            else:
                asset_duration = get_duration(local_asset)
                trim_to = max(0.5, min(target_duration, asset_duration if asset_duration > 0 else target_duration))
                subprocess.run(
                    [
                        settings.FFMPEG_PATH,
                        "-i", local_asset.as_posix(),
                        "-t", str(trim_to),
                        "-vf", VERTICAL_FILTER,
                        "-c:v", "libx264",
                        "-pix_fmt", "yuv420p",
                        "-c:a", "aac",
                        "-movflags", "+faststart",
                        part_path.as_posix(),
                        "-y",
                    ],
                    check=True,
                    capture_output=True,
                )
                part_duration = trim_to

            if not part_path.exists() or part_path.stat().st_size < 1000:
                log.warning("render_part_empty", slot_id=slot_id, path=str(part_path))
                continue
            part_paths.append(part_path)
            part_durations.append(part_duration)

        if not part_paths:
            raise ValueError("All video parts were empty — nothing to concatenate.")

        concat_file = work / "concat.txt"
        with concat_file.open("w", encoding="utf-8") as handle:
            for part in part_paths:
                handle.write(f"file '{part.as_posix()}'\n")

        assembled_path = work / "assembled.mp4"
        result = subprocess.run(
            [
                settings.FFMPEG_PATH,
                "-f", "concat",
                "-safe", "0",
                "-i", concat_file.as_posix(),
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                assembled_path.as_posix(),
                "-y",
            ],
            capture_output=True,
        )
        if result.returncode != 0:
            stderr = result.stderr.decode(errors="replace")
            log.error(
                "ffmpeg_concat_failed",
                returncode=result.returncode,
                stderr=stderr,
            )
            result.check_returncode()

        current = assembled_path
        text_slots = [
            slot for slot in template.get("slots", [])
            if slot.get("type") == "text_overlay"
        ]
        for slot in text_slots:
            text = text_values.get(str(slot["slot_id"]), "").strip()
            if not text:
                continue
            window = _text_window_in_assembled(slot, video_slots, part_durations)
            if not window:
                continue
            start_t, end_t = window
            out_path = work / f"text_{slot['slot_id']}.mp4"
            escaped = _escape_drawtext(text)
            drawtext = (
                f"drawtext=text='{escaped}':fontcolor=white:fontsize=64:"
                f"box=1:boxcolor=black@0.5:boxborderw=20:"
                f"x=(w-text_w)/2:y=h*0.15:"
                f"enable='between(t,{start_t:.3f},{end_t:.3f})'"
            )
            result = subprocess.run(
                [
                    settings.FFMPEG_PATH,
                    "-i", current.as_posix(),
                    "-vf", drawtext,
                    "-c:a", "copy",
                    "-movflags", "+faststart",
                    out_path.as_posix(),
                    "-y",
                ],
                capture_output=True,
            )
            if result.returncode != 0:
                stderr = result.stderr.decode(errors="replace")
                log.warning("text_overlay_fallback_no_audio", stderr=stderr)
                result = subprocess.run(
                    [
                        settings.FFMPEG_PATH,
                        "-i", current.as_posix(),
                        "-vf", drawtext,
                        "-movflags", "+faststart",
                        out_path.as_posix(),
                        "-y",
                    ],
                    check=True,
                    capture_output=True,
                )
            else:
                result.check_returncode()
            current = out_path

        audio_profile = template.get("audio_profile") or {}
        music_path = pick_music_for_audio_profile(audio_profile)
        if music_path:
            music_out = work / "with_music.mp4"
            add_background_music(
                current,
                music_path,
                music_out,
                duck_for_speech=should_duck_for_speech(audio_profile),
            )
            current = music_out

        return current.as_posix()
    finally:
        for path in temp_downloads:
            if path.exists():
                try:
                    path.unlink()
                except OSError:
                    pass
