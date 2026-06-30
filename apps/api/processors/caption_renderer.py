"""
ViraEdit — ASS caption burn-in renderer (Module 03).

Renders word-timed captions onto video using FFmpeg + ASS subtitles.
Nepali captions use settings.DEVANAGARI_FONT_PATH (video only, not UI).
"""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

from config import settings

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
    _write_ass(words, preset, ass_path)
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


def _write_ass(words: list[dict[str, Any]], preset: dict[str, Any], out_path: Path) -> None:
    words_per_group = int(preset.get("words_per_group", 3))
    groups: list[dict[str, Any]] = []
    for i in range(0, len(words), words_per_group):
        chunk = words[i : i + words_per_group]
        if chunk:
            groups.append({
                "words": chunk,
                "start": chunk[0]["start"],
                "end": chunk[-1]["end"],
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
            dur_cs = max(1, int((float(w["end"]) - float(w["start"])) * 100))
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
        start = _to_srt_time(float(seg["start"]))
        end = _to_srt_time(float(seg["end"]))
        lines.append(f"{i}\n{start} --> {end}\n{seg['text']}\n")
    return "\n".join(lines)


def segments_from_words(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build phrase-level segments from word list for SRT export."""
    if not words:
        return []
    segments: list[dict[str, Any]] = []
    buf: list[dict[str, Any]] = [words[0]]
    for w in words[1:]:
        gap = float(w["start"]) - float(buf[-1]["end"])
        if gap > 0.8:
            segments.append({
                "text": " ".join(x["word"] for x in buf),
                "start": buf[0]["start"],
                "end": buf[-1]["end"],
            })
            buf = [w]
        else:
            buf.append(w)
    if buf:
        segments.append({
            "text": " ".join(x["word"] for x in buf),
            "start": buf[0]["start"],
            "end": buf[-1]["end"],
        })
    return segments


def _to_srt_time(s: float) -> str:
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    ms = int((sec - int(sec)) * 1000)
    return f"{int(h):02d}:{int(m):02d}:{int(sec):02d},{ms:03d}"
