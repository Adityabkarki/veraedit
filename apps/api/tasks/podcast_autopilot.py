"""
ViraEdit — Podcast Auto-Edit.

After analysis completes for podcast content, generates actionable edit
suggestions (filler removal, silence trim, speaker labels) so the user
lands in a partially edited project.

Does NOT mutate timeline directly — creates suggestions the user can accept.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

log = logging.getLogger("viraedit.tasks.podcast_autopilot")

# Podcast editorial profile (from editorial-intelligence.md)
PODCAST_MAX_SILENCE_S = 0.8
PODCAST_FILLER_WORDS = {"uh", "um", "हैन र", "भनेको", "हो र", "basically", "you know"}


def build_podcast_autopilot_suggestions(
    transcript_words: list[dict[str, Any]],
    scenes: list[dict[str, Any]],
    content_type: str = "podcast",
) -> list[dict[str, Any]]:
    """
    Return suggestion payloads ready for INSERT into suggestions table.

    Each dict: {type, title, description, action, confidence, start_time, end_time}
    """
    if content_type not in ("podcast", "video_podcast", "interview"):
        return []

    suggestions: list[dict[str, Any]] = []

    # ── 1. Batch filler removal ───────────────────────────────────────────────
    filler_spans = _find_filler_spans(transcript_words)
    if filler_spans:
        total_saved = sum(e - s for s, e in filler_spans)
        suggestions.append({
            "type": "REMOVE_FILLERS",
            "title": f"Remove {len(filler_spans)} filler words",
            "description": (
                f"Podcast auto-edit: remove fillers to save ~{total_saved:.1f}s. "
                "Review each cut before export."
            ),
            "action": {
                "operation": "remove_fillers",
                "spans": [{"start": s, "end": e} for s, e in filler_spans[:50]],
                "count": len(filler_spans),
                "time_saved_seconds": round(total_saved, 1),
                "source": "podcast_autopilot",
            },
            "confidence": 0.85,
            "start_time": filler_spans[0][0] if filler_spans else None,
            "end_time": filler_spans[-1][1] if filler_spans else None,
        })

    # ── 2. Long silence trim ──────────────────────────────────────────────────
    silence_spans = _find_long_silences(transcript_words, PODCAST_MAX_SILENCE_S)
    if silence_spans:
        saved = sum(e - s for s, e in silence_spans)
        suggestions.append({
            "type": "TRIM_SILENCE",
            "title": f"Trim {len(silence_spans)} long pauses",
            "description": (
                f"Remove silences longer than {PODCAST_MAX_SILENCE_S}s "
                f"(saves ~{saved:.1f}s). Keeps natural breathing room."
            ),
            "action": {
                "operation": "trim_silence",
                "max_silence_seconds": PODCAST_MAX_SILENCE_S,
                "spans": [{"start": s, "end": e} for s, e in silence_spans[:30]],
                "source": "podcast_autopilot",
            },
            "confidence": 0.8,
            "start_time": silence_spans[0][0] if silence_spans else None,
            "end_time": silence_spans[-1][1] if silence_spans else None,
        })

    # ── 3. Speaker lower-thirds at scene starts ───────────────────────────────
    for i, scene in enumerate(scenes[:12]):
        start = float(scene.get("start_time", 0))
        title = scene.get("title") or f"Segment {i + 1}"
        suggestions.append({
            "type": "ADD_OVERLAY",
            "title": f"Speaker card: {title[:40]}",
            "description": "Add editable lower-third at segment start (moveable in overlay editor).",
            "action": {
                "operation": "add_speaker_overlay",
                "visual_type": "key_term",
                "display_value": title[:60],
                "start_time": start,
                "duration": 4.0,
                "x_pct": 10,
                "y_pct": 85,
                "source": "podcast_autopilot",
            },
            "confidence": 0.7,
            "start_time": start,
            "end_time": start + 4.0,
        })

    log.info(
        "podcast_autopilot_suggestions: count=%d fillers=%d silences=%d",
        len(suggestions),
        len(filler_spans),
        len(silence_spans),
    )
    return suggestions


def _find_filler_spans(words: list[dict[str, Any]]) -> list[tuple[float, float]]:
    spans: list[tuple[float, float]] = []
    for w in words:
        text = str(w.get("word", "")).strip().lower()
        if text in PODCAST_FILLER_WORDS or text in {f.lower() for f in PODCAST_FILLER_WORDS}:
            start = float(w.get("start", 0))
            end = float(w.get("end", start + 0.1))
            spans.append((start, end))
    return spans


def _find_long_silences(
    words: list[dict[str, Any]],
    min_gap: float,
) -> list[tuple[float, float]]:
    """Find gaps between consecutive words exceeding min_gap seconds."""
    if len(words) < 2:
        return []
    sorted_words = sorted(words, key=lambda w: float(w.get("start", 0)))
    spans: list[tuple[float, float]] = []
    for i in range(len(sorted_words) - 1):
        end_a = float(sorted_words[i].get("end", 0))
        start_b = float(sorted_words[i + 1].get("start", 0))
        gap = start_b - end_a
        if gap >= min_gap:
            spans.append((end_a, start_b))
    return spans


def persist_autopilot_suggestions(
    conn: Any,
    project_id: str,
    asset_id: str,
    suggestions: list[dict[str, Any]],
) -> int:
    """Insert autopilot suggestions into DB. Returns count inserted."""
    import json

    count = 0
    for sug in suggestions:
        conn.execute(
            __import__("sqlalchemy").text("""
                INSERT INTO suggestions (
                    id, project_id, asset_id, type, title, description,
                    action, confidence, status, start_time, end_time,
                    created_at, updated_at
                ) VALUES (
                    :id, :project_id, :asset_id, :type, :title, :description,
                    CAST(:action AS jsonb), :confidence, 'PENDING', :start_time, :end_time,
                    NOW(), NOW()
                )
            """),
            {
                "id": str(uuid.uuid4()),
                "project_id": project_id,
                "asset_id": asset_id,
                "type": sug["type"],
                "title": sug["title"],
                "description": sug["description"],
                "action": json.dumps(sug["action"], ensure_ascii=False),
                "confidence": sug.get("confidence", 0.7),
                "start_time": sug.get("start_time"),
                "end_time": sug.get("end_time"),
            },
        )
        count += 1
    return count
