"""Resolve Director B-roll entries via Pexels — Fallback Guarantee Law."""
from __future__ import annotations

import copy
import uuid
from typing import Any

import structlog

from processors.stock_search import search_pexels
from services.director.broll_confidence import (
    PARTIAL_THRESHOLD,
    is_usable_broll_confidence,
    pick_best_broll_match,
)

log = structlog.get_logger("viraedit.director.resolve_broll")

BROLL_FALLBACK_COMPONENTS = {
    "topic_shift": "topic_title_card",
    "high_emphasis_moment": "pull_quote_card",
}


def resolve_broll_entries(
    timeline: dict[str, Any],
    *,
    content_type: str = "podcast",
    theme: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Populate assetUrl for B-roll entries or convert to motion-graphics fallback.

    Never leaves a realized trigger with no visible outcome.
    """
    next_tl = copy.deepcopy(timeline)
    tracks = next_tl.setdefault("tracks", {})
    broll_entries = list(tracks.get("broll") or [])
    if not broll_entries:
        return next_tl

    orientation = "portrait" if content_type == "social" else "landscape"
    mood_keywords = _mood_keywords_from_theme(theme)
    resolved: list[dict[str, Any]] = []
    fallback_count = 0

    for entry in broll_entries:
        asset_url = str(entry.get("assetUrl") or "").strip()
        if asset_url:
            resolved.append(entry)
            continue

        query = _build_broll_query(str(entry.get("searchQuery") or "").strip(), mood_keywords)
        if not query:
            _convert_broll_to_fallback(next_tl, entry, reason="missing_search_query")
            fallback_count += 1
            continue

        results = search_pexels(query, count=5, orientation=orientation)
        best, score = pick_best_broll_match(query, results)

        if best is None or not is_usable_broll_confidence(score):
            log.info(
                "broll_fallback_to_mg",
                query=query,
                trigger_id=entry.get("triggerId"),
                score=round(score, 3),
                threshold=PARTIAL_THRESHOLD,
            )
            _convert_broll_to_fallback(
                next_tl,
                entry,
                reason="below_confidence_threshold" if best else "no_asset_found",
                search_query=query,
            )
            fallback_count += 1
            continue

        resolved.append(
            {
                **entry,
                "assetUrl": best["video_url"],
                "pexelsId": best.get("id"),
                "thumbnailUrl": best.get("thumbnail_url"),
                "matchConfidence": round(score, 3),
                "searchQuery": query,
            }
        )

    tracks["broll"] = resolved
    if fallback_count:
        log.info("broll_mg_fallbacks_applied", count=fallback_count)
    return next_tl


def reroll_broll_with_pexels(
    timeline: dict[str, Any],
    entry_id: str,
    search_query: str,
    *,
    content_type: str = "podcast",
    theme: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Re-roll a single B-roll entry; MG fallback if Pexels returns nothing usable."""
    next_tl = copy.deepcopy(timeline)
    tracks = next_tl.setdefault("tracks", {})
    orientation = "portrait" if content_type == "social" else "landscape"
    mood_keywords = _mood_keywords_from_theme(theme)
    query = _build_broll_query(search_query.strip(), mood_keywords)

    updated: list[dict[str, Any]] = []
    for entry in tracks.get("broll") or []:
        if entry.get("id") != entry_id:
            updated.append(entry)
            continue
        if not query:
            _convert_broll_to_fallback(next_tl, entry, reason="missing_search_query")
            continue

        results = search_pexels(query, count=5, orientation=orientation)
        best, score = pick_best_broll_match(query, results)
        if best is None or not is_usable_broll_confidence(score):
            _convert_broll_to_fallback(
                next_tl,
                entry,
                reason="no_asset_found",
                search_query=query,
            )
            continue

        updated.append(
            {
                **entry,
                "searchQuery": query,
                "assetUrl": best["video_url"],
                "pexelsId": best.get("id"),
                "matchConfidence": round(score, 3),
            }
        )
    tracks["broll"] = updated
    return next_tl


def _build_broll_query(base: str, mood_keywords: list[str]) -> str:
    if not base:
        return ""
    if not mood_keywords:
        return base
    return f"{base} {' '.join(mood_keywords)}"


def _mood_keywords_from_theme(theme: dict[str, Any] | None) -> list[str]:
    if not theme:
        return []
    meta = theme.get("meta") or {}
    keywords = meta.get("brollMoodKeywords")
    if isinstance(keywords, list):
        return [str(k) for k in keywords if k][:3]
    return []


def _convert_broll_to_fallback(
    timeline: dict[str, Any],
    entry: dict[str, Any],
    *,
    reason: str,
    search_query: str = "",
) -> None:
    """Replace a failed B-roll entry with a themed motion-graphic fallback."""
    trigger_id = str(entry.get("triggerId") or "")
    trigger = _find_trigger(timeline, trigger_id, entry.get("id"))
    trigger_type = str(trigger.get("type") if trigger else "topic_shift")
    component_id = BROLL_FALLBACK_COMPONENTS.get(trigger_type, "topic_title_card")

    label = search_query or str(entry.get("searchQuery") or "Topic")
    props: dict[str, Any] = {"label": label, "title": label}
    if component_id == "pull_quote_card":
        props = {"text": label}

    mg_id = f"fallback-{entry.get('id') or uuid.uuid4().hex[:8]}"
    start_frame = int(entry.get("startFrame") or 0)
    duration = int(entry.get("durationInFrames") or 90)

    mg_entry = {
        "id": mg_id,
        "componentId": component_id,
        "startFrame": start_frame,
        "durationInFrames": duration,
        "layerDepth": 18 if component_id == "topic_title_card" else 62,
        "props": props,
        "triggerId": trigger_id,
    }

    tracks = timeline.setdefault("tracks", {})
    mg_list = list(tracks.get("motionGraphics") or [])
    mg_list.append(mg_entry)
    tracks["motionGraphics"] = mg_list

    if trigger:
        meta = dict(trigger.get("metadata") or {})
        meta["suppressionReason"] = reason
        meta["fallbackTier"] = "broll_to_mg"
        meta["fallbackComponentId"] = component_id
        trigger.update(
            {
                "status": "realized",
                "resultingEntryId": mg_id,
                "metadata": meta,
            }
        )


def _find_trigger(
    timeline: dict[str, Any],
    trigger_id: str,
    entry_id: Any,
) -> dict[str, Any] | None:
    for trigger in timeline.get("triggers") or []:
        if trigger.get("id") == trigger_id or trigger.get("resultingEntryId") == entry_id:
            return trigger
    return None


def _suppress_trigger(
    timeline: dict[str, Any],
    entry: dict[str, Any],
    reason: str,
) -> None:
    """Deprecated — kept for callers that still import; routes to MG fallback."""
    _convert_broll_to_fallback(timeline, entry, reason=reason)
