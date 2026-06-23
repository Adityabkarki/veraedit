"""
ViraEdit — Highlights engine.

Selects promo-style moments (15-90s) with per-platform aspect-ratio packs.
"""
from __future__ import annotations

import uuid
from typing import Any

MIN_HIGHLIGHT_S = 15.0
MAX_HIGHLIGHT_S = 90.0
MAX_HIGHLIGHTS = 6

PLATFORM_PACKS = [
    {"platform": "youtube", "aspect_ratio": "16:9", "width": 1920, "height": 1080, "crop": "center"},
    {"platform": "tiktok", "aspect_ratio": "9:16", "width": 1080, "height": 1920, "crop": "center"},
    {"platform": "reels", "aspect_ratio": "9:16", "width": 1080, "height": 1920, "crop": "center"},
    {"platform": "instagram_feed", "aspect_ratio": "4:5", "width": 1080, "height": 1350, "crop": "center"},
    {"platform": "linkedin", "aspect_ratio": "1:1", "width": 1080, "height": 1080, "crop": "center"},
]


def _duration(scene: dict) -> float:
    return max(0.0, float(scene.get("end_time", 0)) - float(scene.get("start_time", 0)))


def _chapter_index(scene: dict, chapters: list[dict]) -> int:
    mid = (float(scene.get("start_time", 0)) + float(scene.get("end_time", 0))) / 2
    for i, ch in enumerate(chapters):
        if ch["start_time"] <= mid <= ch["end_time"]:
            return i
    return 0


def extract_highlight_candidates(
    micro_scenes: list[dict],
    chapters: list[dict],
    duration: float,
) -> list[dict]:
    """Pick diverse high-emotion promo moments."""
    scored: list[tuple[float, dict]] = []
    for scene in micro_scenes:
        hs = float(scene.get("highlight_score", 0))
        if hs < 0.72 and not scene.get("is_highlight"):
            continue
        dur = _duration(scene)
        if dur < MIN_HIGHLIGHT_S:
            # extend window to min duration centered
            mid = (float(scene["start_time"]) + float(scene["end_time"])) / 2
            half = MIN_HIGHLIGHT_S / 2
            start = max(0.0, mid - half)
            end = min(duration, mid + half)
        elif dur > MAX_HIGHLIGHT_S:
            start = float(scene["start_time"])
            end = start + MAX_HIGHLIGHT_S
        else:
            start = float(scene["start_time"])
            end = float(scene["end_time"])

        scored.append((hs, {
            **scene,
            "start_time": start,
            "end_time": end,
            "_chapter_idx": _chapter_index(scene, chapters),
        }))

    scored.sort(key=lambda x: x[0], reverse=True)

    picked: list[dict] = []
    used_chapters: set[int] = set()
    for _, scene in scored:
        ch_idx = scene.get("_chapter_idx", 0)
        if ch_idx in used_chapters and len(used_chapters) < len(chapters):
            continue
        used_chapters.add(ch_idx)
        picked.append(scene)
        if len(picked) >= MAX_HIGHLIGHTS:
            break

    return picked


def build_highlight_records(
    candidates: list[dict],
    project_id: str,
    asset_id: str,
) -> list[dict]:
    """Build DB-ready highlight rows with platform packs."""
    records: list[dict] = []
    for scene in candidates:
        title = scene.get("title") or "Highlight"
        summary = scene.get("summary") or ""
        packs = [{**p, "thumbnail_url": None} for p in PLATFORM_PACKS]
        records.append({
            "id": str(uuid.uuid4()),
            "project_id": project_id,
            "asset_id": asset_id,
            "start_time": float(scene["start_time"]),
            "end_time": float(scene["end_time"]),
            "title": title,
            "summary": summary,
            "promo_copy_en": f"Don't miss: {summary[:120]}" if summary else f"Watch: {title}",
            "promo_caption_ne": scene.get("transcript_excerpt", "")[:200],
            "highlight_score": float(scene.get("highlight_score", 0.8)),
            "platform_packs": packs,
            "thumbnail_url": None,
            "status": "detected",
            "superseded": False,
        })
    return records
