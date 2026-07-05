"""Resolve Director B-roll entries via Pexels — No-Empty-Asset Law."""
from __future__ import annotations

import copy
from typing import Any

import structlog

from processors.stock_search import search_pexels

log = structlog.get_logger("viraedit.director.resolve_broll")


def resolve_broll_entries(
    timeline: dict[str, Any],
    *,
    content_type: str = "podcast",
) -> dict[str, Any]:
    """
    Populate assetUrl for B-roll entries or suppress triggers when no stock match.

    Never leaves a realized B-roll trigger with an empty assetUrl.
    """
    next_tl = copy.deepcopy(timeline)
    tracks = next_tl.setdefault("tracks", {})
    broll_entries = list(tracks.get("broll") or [])
    if not broll_entries:
        return next_tl

    orientation = "portrait" if content_type == "social" else "landscape"
    resolved: list[dict[str, Any]] = []
    suppressed_ids: set[str] = set()

    for entry in broll_entries:
        asset_url = str(entry.get("assetUrl") or "").strip()
        if asset_url:
            resolved.append(entry)
            continue

        query = str(entry.get("searchQuery") or "").strip()
        if not query:
            suppressed_ids.add(str(entry.get("triggerId", "")))
            _suppress_trigger(next_tl, entry, "missing_search_query")
            continue

        results = search_pexels(query, count=3, orientation=orientation)
        if not results:
            log.info("broll_no_asset_found", query=query, trigger_id=entry.get("triggerId"))
            suppressed_ids.add(str(entry.get("triggerId", "")))
            _suppress_trigger(next_tl, entry, "no_asset_found")
            continue

        best = results[0]
        resolved.append(
            {
                **entry,
                "assetUrl": best["video_url"],
                "pexelsId": best.get("id"),
                "thumbnailUrl": best.get("thumbnail_url"),
            }
        )

    tracks["broll"] = resolved
    if suppressed_ids:
        log.info(
            "broll_triggers_suppressed",
            count=len(suppressed_ids),
            reasons=["no_asset_found", "missing_search_query"],
        )
    return next_tl


def reroll_broll_with_pexels(
    timeline: dict[str, Any],
    entry_id: str,
    search_query: str,
    *,
    content_type: str = "podcast",
) -> dict[str, Any]:
    """Re-roll a single B-roll entry; suppress if Pexels returns nothing."""
    next_tl = copy.deepcopy(timeline)
    tracks = next_tl.setdefault("tracks", {})
    orientation = "portrait" if content_type == "social" else "landscape"
    query = search_query.strip()
    results = search_pexels(query, count=3, orientation=orientation) if query else []

    updated: list[dict[str, Any]] = []
    for entry in tracks.get("broll") or []:
        if entry.get("id") != entry_id:
            updated.append(entry)
            continue
        if not results:
            _suppress_trigger(next_tl, entry, "no_asset_found")
            continue
        best = results[0]
        updated.append(
            {
                **entry,
                "searchQuery": query,
                "assetUrl": best["video_url"],
                "pexelsId": best.get("id"),
            }
        )
    tracks["broll"] = updated
    return next_tl


def _suppress_trigger(
    timeline: dict[str, Any],
    entry: dict[str, Any],
    reason: str,
) -> None:
    trigger_id = entry.get("triggerId")
    entry_id = entry.get("id")
    triggers = []
    for trigger in timeline.get("triggers") or []:
        if trigger.get("id") == trigger_id or trigger.get("resultingEntryId") == entry_id:
            meta = dict(trigger.get("metadata") or {})
            meta["suppressionReason"] = reason
            triggers.append(
                {
                    **trigger,
                    "status": "suppressed",
                    "resultingEntryId": None,
                    "metadata": meta,
                }
            )
        else:
            triggers.append(trigger)
    timeline["triggers"] = triggers
