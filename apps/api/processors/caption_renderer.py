"""
ViraEdit — ASS caption burn-in renderer (Module 03) + Remotion v2 (Phase 09).

Primary path: Remotion animated overlays composited via FFmpeg.
Fallback: ASS subtitle burn-in when Remotion service is unreachable.
"""
from __future__ import annotations

import logging
import subprocess
from pathlib import Path
from typing import Any

from config import settings

log = logging.getLogger("viraedit.processors.caption_renderer")

STYLE_PRESETS: dict[str, dict[str, Any]] = {
    "hormozi": {
        "font": "Montserrat-Bold",
        "fontsize": 72,
        "primary_color": "&H00FFFFFF",
        "outline_color": "&H00000000",
        "outline": 3,
        "bold": 1,
        "words_per_group": 3,
        "position": "bottom_third",
    },
    "mrbeast": {
        "font": "Bangers-Regular",
        "fontsize": 80,
        "primary_color": "&H00FFFF00",
        "outline_color": "&H00000000",
        "outline": 4,
        "bold": 1,
        "words_per_group": 2,
        "position": "center",
    },
    "minimal": {
        "font": "Inter-Regular",
        "fontsize": 52,
        "primary_color": "&H00FFFFFF",
        "outline_color": "&H80000000",
        "outline": 2,
        "bold": 0,
        "words_per_group": 5,
        "position": "bottom_quarter",
    },
    "nepali_bold": {
        "font_path": settings.DEVANAGARI_FONT_PATH,
        "font": "NotoSansDevanagari-Regular",
        "fontsize": 68,
        "primary_color": "&H00FFFFFF",
        "outline_color": "&H00000000",
        "outline": 3,
        "bold": 1,
        "words_per_group": 3,
        "position": "bottom_third",
    },
    "kinetic": {
        "font": "Montserrat-ExtraBold",
        "fontsize": 76,
        "primary_color": "&H00FFFFFF",
        "outline_color": "&H00FF6B00",
        "outline": 3,
        "bold": 1,
        "words_per_group": 2,
        "position": "center",
    },
}

CAPTION_STYLE_NAMES = list(STYLE_PRESETS.keys())


def _fill_null_timestamps(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Assign fallback timestamps to words with null start/end."""
    if not words:
        return words
    filled = list(words)
    null_count = sum(1 for w in filled if w.get("start") is None or w.get("end") is None)
    if null_count == 0:
        return filled
    if null_count == len(filled):
        step = 0.5
        for i, w in enumerate(filled):
            w["start"] = i * step
            w["end"] = (i + 1) * step
        log.warning("filled all %d null timestamps with synthetic values", null_count)
    else:
        last_good: float | None = None
        for w in filled:
            if w.get("start") is not None and w.get("end") is not None:
                last_good = float(w["end"])
            elif last_good is not None:
                w["start"] = last_good
                w["end"] = last_good + 0.5
                last_good += 0.5
            else:
                w["start"] = 0.0
                w["end"] = 0.5
                last_good = 0.5
        log.warning("filled %d of %d null timestamps with estimated values", null_count, len(filled))
    return filled


def render_captions(
    input_path: str | Path,
    output_path: str | Path,
    words: list[dict[str, Any]],
    style: str = "hormozi",
) -> str:
    """Burn captions into video; returns output path as string."""
    in_path = Path(input_path)
    out_path = Path(output_path)
    preset = STYLE_PRESETS.get(style, STYLE_PRESETS["minimal"])
    ass_path = in_path.with_name(f"{in_path.stem}_{style}.ass")
    _write_ass(_fill_null_timestamps(words), preset, ass_path)
    fonts_dir = Path(settings.DEVANAGARI_FONT_PATH).parent.as_posix()
    vf = f"ass={ass_path.as_posix()}:fontsdir={fonts_dir}"
    subprocess.run(
        [
            settings.FFMPEG_PATH,
            "-i",
            in_path.as_posix(),
            "-vf",
            vf,
            "-c:a",
            "copy",
            out_path.as_posix(),
            "-y",
        ],
        check=True,
        capture_output=True,
    )
    if ass_path.exists():
        ass_path.unlink()
    return out_path.as_posix()


async def render_captions_v2(
    input_path: str | Path,
    output_path: str | Path,
    words: list[dict[str, Any]],
    style: str = "hormozi",
    *,
    font_family: str | None = None,
    width: int = 1080,
    height: int = 1920,
) -> str:
    """
    Remotion-based caption rendering with ASS fallback on service failure.

    Returns output path string. Uses animated typography from the Remotion
    service when available; falls back to render_captions() otherwise.
    """
    from processors.remotion_client import (
        FONT_BY_STYLE,
        composite_overlay_onto_video,
        render_caption_overlay,
    )
    from processors.text_editor import get_duration

    in_path = Path(input_path)
    out_path = Path(output_path)
    duration = get_duration(in_path)
    family = font_family or FONT_BY_STYLE.get(style, "Montserrat")

    fixed_words = _fill_null_timestamps(words)
    # Full-frame Remotion renders are too slow for long videos — use ASS for anything over 2 min.
    if duration > 120:
        log.info(
            "remotion_skipped_long_video duration_s=%.1f style=%s",
            duration,
            style,
        )
        return render_captions(in_path, out_path, fixed_words, style=style)

    try:
        overlay_path = await render_caption_overlay(
            fixed_words,
            style,
            duration,
            width=width,
            height=height,
            font_family=family,
        )
        composite_overlay_onto_video(in_path, overlay_path, out_path)
        overlay = Path(overlay_path)
        if overlay.exists():
            overlay.unlink()
        return out_path.as_posix()
    except Exception as exc:
        log.warning(
            "remotion_caption_fallback_to_ass style=%s error=%s",
            style,
            exc,
        )
        return render_captions(in_path, out_path, fixed_words, style=style)


def _write_ass(words: list[dict[str, Any]], preset: dict[str, Any], out_path: Path) -> None:
    words_per_group = int(preset.get("words_per_group", 3))
    groups: list[dict[str, Any]] = []
    for i in range(0, len(words), words_per_group):
        chunk = words[i : i + words_per_group]
        if not chunk:
            continue
        chunk_start = chunk[0].get("start")
        chunk_end = chunk[-1].get("end")
        if chunk_start is None or chunk_end is None:
            continue
        groups.append({
            "words": chunk,
            "start": chunk_start,
            "end": chunk_end,
        })

    alignment_map = {"bottom_third": 2, "center": 5, "bottom_quarter": 2, "top": 8}
    alignment = alignment_map.get(preset.get("position", "bottom_third"), 2)
    marginv = 200 if preset.get("position") == "bottom_third" else 50

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, Bold, BorderStyle, Outline, Alignment, MarginV, Encoding
Style: Default,{preset['font']},{preset['fontsize']},{preset['primary_color']},{preset['outline_color']},{preset['bold']},1,{preset['outline']},{alignment},{marginv},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events: list[str] = []
    for g in groups:
        start = _to_ass_time(float(g["start"]))
        end = _to_ass_time(float(g["end"]))
        parts: list[str] = []
        for w in g["words"]:
            w_start = w.get("start")
            w_end = w.get("end")
            if w_start is None or w_end is None:
                continue
            dur_cs = max(1, int((float(w_end) - float(w_start)) * 100))
            parts.append(f"{{\\k{dur_cs}}}{w['word']}")
        events.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{' '.join(parts)}")

    out_path.write_text(header + "\n".join(events), encoding="utf-8")


def _to_ass_time(s: float) -> str:
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = int(s % 60)
    cs = int((s - int(s)) * 100)
    return f"{h}:{m:02d}:{sec:02d}.{cs:02d}"


def words_to_srt(segments: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for i, seg in enumerate(segments, 1):
        start = _to_srt_time(float(seg.get("start", 0.0)))
        end = _to_srt_time(float(seg.get("end", 0.0)))
        lines.append(f"{i}\n{start} --> {end}\n{seg['text']}\n")
    return "\n".join(lines)


def segments_from_words(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build phrase-level segments from word list for SRT export."""
    if not words:
        return []
    segments: list[dict[str, Any]] = []
    buf: list[dict[str, Any]] = [words[0]]
    for w in words[1:]:
        w_start = w.get("start")
        w_end = w.get("end")
        buf_end = buf[-1].get("end")
        if w_start is None or w_end is None or buf_end is None:
            buf.append(w)
            continue
        gap = float(w_start) - float(buf_end)
        if gap > 0.8:
            segments.append({
                "text": " ".join(x["word"] for x in buf),
                "start": buf[0].get("start", 0.0),
                "end": buf[-1].get("end", 0.0),
            })
            buf = [w]
        else:
            buf.append(w)
    if buf:
        segments.append({
            "text": " ".join(x["word"] for x in buf),
            "start": buf[0].get("start", 0.0),
            "end": buf[-1].get("end", 0.0),
        })
    return segments


def _to_srt_time(s: float) -> str:
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    ms = int((sec - int(sec)) * 1000)
    return f"{int(h):02d}:{int(m):02d}:{int(sec):02d},{ms:03d}"
