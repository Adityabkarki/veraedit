"""
ViraEdit — Chapter planner.

Merges micro-scenes (30–90s editing signals) into podcast chapters (4–15 min)
aligned on topic continuity.
"""
from __future__ import annotations

from typing import Any

MIN_CHAPTER_DURATION_S = 240.0   # 4 minutes
MAX_CHAPTER_DURATION_S = 900.0   # 15 minutes
TARGET_CHAPTER_DURATION_S = 600.0  # 10 minutes ideal


def _scene_duration(scene: dict) -> float:
    return max(0.0, float(scene.get("end_time", 0)) - float(scene.get("start_time", 0)))


def _topics_set(scene: dict) -> set[str]:
    raw = scene.get("topics") or []
    return {str(t).strip().lower() for t in raw if t}


def _topic_overlap(a: dict, b: dict) -> bool:
    ta, tb = _topics_set(a), _topics_set(b)
    if not ta or not tb:
        return True
    return bool(ta & tb)


def _build_chapter(micro_scenes: list[dict], start_i: int, end_i: int, index: int) -> dict:
    chunk = micro_scenes[start_i : end_i + 1]
    start_time = float(chunk[0].get("start_time", 0))
    end_time = float(chunk[-1].get("end_time", start_time))
    topics: list[str] = []
    for s in chunk:
        for t in s.get("topics") or []:
            ts = str(t).strip()
            if ts and ts not in topics:
                topics.append(ts)

    titles = [s.get("title") or "" for s in chunk if s.get("title")]
    summaries = [s.get("summary") or "" for s in chunk if s.get("summary")]
    excerpts = [s.get("transcript_excerpt") or "" for s in chunk if s.get("transcript_excerpt")]

    highlight_scores = [float(s.get("highlight_score", 0.5)) for s in chunk]
    retention_scores = [float(s.get("retention_score", 0.5)) for s in chunk]
    energy_levels = [float(s.get("energy_level", 0.5)) for s in chunk]

    platform_merged: dict[str, float] = {}
    for s in chunk:
        ps = s.get("platform_scores") or {}
        for k, v in ps.items():
            if k in ("intent", "editorial_adjusted_score", "qualifies_for_short", "editorial_notes"):
                continue
            try:
                fv = float(v)
            except (TypeError, ValueError):
                continue
            platform_merged[k] = max(platform_merged.get(k, 0.0), fv)

    title = titles[0] if titles else f"Chapter {index + 1}"
    summary = summaries[0] if summaries else f"Discussion covering {', '.join(topics[:3]) or 'main topics'}."
    topic_phrase = ", ".join(topics[:3]) if topics else "the key discussion points"
    title_reason = (
        f"Named from the dominant topic thread in this range: {topic_phrase}."
    )

    return {
        "index": index,
        "start_time": start_time,
        "end_time": end_time,
        "title": title,
        "summary": summary,
        "title_reason": title_reason,
        "topics": topics[:8],
        "emotion": chunk[0].get("emotion", "neutral"),
        "energy_level": sum(energy_levels) / max(len(energy_levels), 1),
        "transcript_excerpt": excerpts[0][:500] if excerpts else "",
        "is_highlight": any(bool(s.get("is_highlight")) for s in chunk),
        "highlight_score": max(highlight_scores) if highlight_scores else 0.5,
        "retention_score": sum(retention_scores) / max(len(retention_scores), 1),
        "platform_scores": platform_merged,
        "scene_kind": "chapter",
        "micro_scene_count": len(chunk),
    }


def merge_micro_scenes_to_chapters(
    micro_scenes: list[dict],
    duration: float,
    *,
    min_chapter_s: float = MIN_CHAPTER_DURATION_S,
    max_chapter_s: float = MAX_CHAPTER_DURATION_S,
) -> list[dict]:
    """
    Merge ordered micro-scenes into 4–15 minute chapters.

    For videos shorter than min_chapter_s, returns a single chapter spanning all micro-scenes.
    """
    if not micro_scenes:
        return []

    ordered = sorted(micro_scenes, key=lambda s: float(s.get("start_time", 0)))

    if duration > 0 and duration < min_chapter_s:
        return [_build_chapter(ordered, 0, len(ordered) - 1, 0)]

    chapters: list[dict] = []
    i = 0
    chapter_index = 0

    while i < len(ordered):
        start_i = i
        acc = 0.0

        while i < len(ordered):
            acc += _scene_duration(ordered[i])
            i += 1
            at_min = acc >= min_chapter_s
            at_max = acc >= max_chapter_s
            if i < len(ordered) and not _topic_overlap(ordered[i - 1], ordered[i]):
                if at_min:
                    break
            if at_max:
                break
            if at_min and i < len(ordered):
                # Soft target: prefer breaking near 10 min if next scene is a topic shift
                if acc >= TARGET_CHAPTER_DURATION_S and not _topic_overlap(ordered[i - 1], ordered[i]):
                    break

        chapters.append(_build_chapter(ordered, start_i, i - 1, chapter_index))
        chapter_index += 1

    return chapters


def apply_chapter_titles_from_llm(
    chapters: list[dict],
    llm_chapters: list[dict],
) -> list[dict]:
    """Overlay LLM-refined titles/summaries when indices align."""
    by_index = {int(c.get("index", i)): c for i, c in enumerate(llm_chapters)}
    out: list[dict] = []
    for ch in chapters:
        merged = dict(ch)
        ref = by_index.get(int(ch.get("index", 0)))
        if ref:
            if ref.get("title"):
                merged["title"] = ref["title"]
            if ref.get("summary"):
                merged["summary"] = ref["summary"]
            if ref.get("title_reason"):
                merged["title_reason"] = ref["title_reason"]
        out.append(merged)
    return out
