"""
Content-type-aware editorial suggestions with explicit "why" explanations.
"""
from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger("viraedit.tasks.editorial_suggestions")

# Podcast profile from editorial-intelligence.md
PODCAST_MAX_SILENCE = 0.8
PODCAST_FILLERS = {"uh", "um", "हैन र", "भनेको", "हो र", "basically", "you know"}


def _excerpt_at(words: list[dict], start: float, end: float, max_chars: int = 120) -> str:
    parts = [
        str(w.get("word", ""))
        for w in words
        if float(w.get("start", 0)) >= start - 0.1
        and float(w.get("end", 0)) <= end + 0.1
        and w.get("type") != "silence"
    ]
    text = " ".join(parts).strip()
    return text[:max_chars] + ("…" if len(text) > max_chars else "")


def enhance_suggestion(
    suggestion: dict[str, Any],
    words: list[dict],
    content_type: str,
    scenes: list[dict],
) -> dict[str, Any]:
    """
    Add why_explanation and content-specific description to a suggestion dict.
    Mutates and returns suggestion.
    """
    action = suggestion.get("action") or {}
    if isinstance(action, str):
        action = {}
    st = float(suggestion.get("start_time") or action.get("start_time") or 0)
    en = float(suggestion.get("end_time") or action.get("end_time") or st + 1)
    excerpt = _excerpt_at(words, st, en)

    why_parts: list[str] = []
    ctype = (content_type or "other").lower()

    if ctype in ("podcast", "video_podcast", "interview"):
        why_parts.append("Podcast edit rule: preserve breathing room under 0.8s.")
    elif ctype == "tutorial":
        why_parts.append("Tutorial rule: keep pacing above 150 WPM.")
    elif ctype in ("vlog", "shorts"):
        why_parts.append("Short-form rule: cut dead air aggressively.")

    if excerpt:
        why_parts.append(f'Transcript at this moment: "{excerpt}"')

    scene = next(
        (s for s in scenes if float(s.get("start_time", 0)) <= st <= float(s.get("end_time", 0))),
        None,
    )
    if scene and scene.get("title"):
        why_parts.append(f'Scene topic: {scene.get("title")}')

    suggestion["why_explanation"] = " ".join(why_parts)
    if excerpt and suggestion.get("description"):
        suggestion["description"] = f'{suggestion["description"]} — "{excerpt[:80]}"'
    elif excerpt:
        suggestion["description"] = f'Based on: "{excerpt[:100]}"'

    action["source"] = action.get("source") or "editorial_v2"
    action["content_type"] = content_type
    if suggestion.get("why_explanation"):
        action["why_explanation"] = suggestion["why_explanation"]
    suggestion["action"] = action
    return suggestion


def build_content_type_suggestions(
    words: list[dict],
    scenes: list[dict],
    content_type: str,
    duration: float,
) -> list[dict[str, Any]]:
    """Generate additional rule-based suggestions per content profile."""
    suggestions: list[dict[str, Any]] = []
    ctype = (content_type or "other").lower()

    if ctype in ("podcast", "video_podcast", "interview"):
        # Strong hook check — first 30s
        hook_scenes = [s for s in scenes if float(s.get("start_time", 0)) < 30]
        if hook_scenes:
            hs = hook_scenes[0]
            suggestions.append({
                "type": "ADD_HOOK",
                "title": "Strengthen podcast opening (first 30s)",
                "description": (
                    f'Opening scene "{hs.get("title", "intro")}" — '
                    "add a bold hook line before the main topic."
                ),
                "action": {
                    "operation": "add_hook",
                    "start_time": float(hs.get("start_time", 0)),
                    "scene_title": hs.get("title"),
                },
                "confidence": 0.75,
                "start_time": float(hs.get("start_time", 0)),
                "end_time": min(30.0, float(hs.get("end_time", 30))),
            })

        # Chapter markers from topic shifts
        for i, scene in enumerate(scenes[:15]):
            if i == 0:
                continue
            prev = scenes[i - 1]
            prev_topics = set(prev.get("topics") or [])
            cur_topics = set(scene.get("topics") or [])
            if cur_topics and cur_topics != prev_topics:
                suggestions.append({
                    "type": "ADD_CHAPTER",
                    "title": f'Chapter: {scene.get("title", f"Part {i + 1}")[:50]}',
                    "description": f'Topic shift detected at {scene.get("start_time", 0):.0f}s.',
                    "action": {
                        "operation": "add_chapter_marker",
                        "start_time": float(scene.get("start_time", 0)),
                        "label": scene.get("title") or f"Chapter {i + 1}",
                    },
                    "confidence": 0.82,
                    "start_time": float(scene.get("start_time", 0)),
                    "end_time": float(scene.get("end_time", 0)),
                })

    for sug in suggestions:
        enhance_suggestion(sug, words, content_type, scenes)

    return suggestions
