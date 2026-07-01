"""
ViraEdit — Platform-correct shorts extraction pipeline (Phase 03).

Finds viral moments once, captions once, reframes once, exports per platform.
"""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

from processors.caption_renderer import render_captions_v2
from processors.clip_finder import find_viral_moments
from processors.reframer import PLATFORM_SPECS, export_for_platform, reframe_video
from processors.text_editor import apply_cuts_precise, get_duration

PLATFORM_DURATION_LIMITS = {
    platform: spec["max_duration"]
    for platform, spec in PLATFORM_SPECS.items()
}


async def extract_shorts_for_platforms(
    video_path: str | Path,
    transcript: dict[str, Any],
    platforms: list[str],
    work_dir: str | Path,
    max_clips: int = 5,
) -> dict[str, list[dict[str, Any]]]:
    """
    Single pipeline: find moments once, export per platform.
    Returns {platform: [clip_result, ...]}.
    """
    video = Path(video_path)
    work = Path(work_dir)
    work.mkdir(parents=True, exist_ok=True)

    if not platforms:
        return {}

    tightest_limit = min(PLATFORM_DURATION_LIMITS.get(p, 60) for p in platforms)
    candidates = await find_viral_moments(
        transcript,
        max_clips=max_clips,
        target_duration=tightest_limit,
        content_type="general",
    )

    results: dict[str, list[dict[str, Any]]] = {p: [] for p in platforms}
    total_duration = get_duration(video)

    for i, cand in enumerate(candidates):
        clip_dir = work / f"clip_{i}"
        clip_dir.mkdir(parents=True, exist_ok=True)
        base_clip_path = clip_dir / "base.mp4"

        cuts: list[dict[str, float]] = []
        if cand["start"] > 0.1:
            cuts.append({"start": 0.0, "end": cand["start"]})
        if cand["end"] < total_duration - 0.1:
            cuts.append({"start": cand["end"], "end": total_duration})
        apply_cuts_precise(video, base_clip_path, cuts, force_reencode=True)

        captioned_path = clip_dir / "captioned.mp4"
        offset = cand["start"]
        clip_words = [
            {
                **w,
                "start": round(float(w["start"]) - offset, 3),
                "end": round(float(w["end"]) - offset, 3),
            }
            for w in transcript.get("words", [])
            if float(w.get("start", 0)) >= cand["start"]
            and float(w.get("end", 0)) <= cand["end"] + 0.5
        ]
        style = cand.get("suggested_caption_style", "hormozi")
        if clip_words:
            try:
                await render_captions_v2(base_clip_path, captioned_path, clip_words, style=style)
            except Exception:
                captioned_path = base_clip_path
        else:
            captioned_path = base_clip_path

        reframed_path = clip_dir / "reframed_9x16.mp4"
        reframe_warning: str | None = None
        try:
            _, reframe_warning = reframe_video(
                captioned_path, reframed_path, 1080, 1920, mode="face_track"
            )
        except Exception:
            reframed_path = captioned_path

        for platform in platforms:
            out_path = clip_dir / f"export_{platform}.mp4"
            try:
                export_for_platform(reframed_path, out_path, platform)
            except Exception:
                if reframed_path != out_path:
                    import shutil
                    shutil.copy2(reframed_path, out_path)

            results[platform].append({
                "clip_index": i,
                "title": cand["title"],
                "score": cand["score"],
                "duration": round(cand["end"] - cand["start"], 2),
                "local_path": out_path.as_posix(),
                "reframe_warning": reframe_warning,
            })

    return results
