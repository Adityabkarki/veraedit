"""Director Engine Phase 6 — non-destructive timeline overrides (Python mirror of overrides.ts)."""
from __future__ import annotations

import copy
from typing import Any

from services.director.resolve_broll import reroll_broll_with_pexels

LAYER_DEPTH: dict[str, int] = {
    "metric_ticker": 52,
    "animated_title": 48,
    "lower_third": 55,
    "kinetic_karaoke": 58,
    "strategy_funnel": 35,
    "device_mockup": 28,
}


def _layer_depth(component_id: str) -> int:
    return LAYER_DEPTH.get(component_id, 50)


def _infer_component_id(trigger: dict[str, Any]) -> str:
    meta = trigger.get("metadata") or {}
    comp = meta.get("componentId")
    if isinstance(comp, str) and comp:
        return comp
    return "animated_title"


def delete_timeline_entry(timeline: dict[str, Any], entry_id: str) -> dict[str, Any]:
    next_tl = copy.deepcopy(timeline)
    tracks = next_tl.setdefault("tracks", {})
    tracks["motionGraphics"] = [
        e for e in tracks.get("motionGraphics", []) if e.get("id") != entry_id
    ]
    tracks["broll"] = [e for e in tracks.get("broll", []) if e.get("id") != entry_id]

    triggers = []
    for t in next_tl.get("triggers", []):
        if t.get("resultingEntryId") == entry_id:
            triggers.append({**t, "status": "suppressed", "resultingEntryId": None})
        else:
            triggers.append(t)
    next_tl["triggers"] = triggers
    return next_tl


def promote_trigger(
    timeline: dict[str, Any],
    trigger_id: str,
    component_id: str | None = None,
) -> dict[str, Any]:
    next_tl = copy.deepcopy(timeline)
    trigger = next((t for t in next_tl.get("triggers", []) if t.get("id") == trigger_id), None)
    if not trigger or trigger.get("status") != "suppressed":
        return timeline

    fps = float(next_tl.get("fps") or 30)
    comp_id = component_id or _infer_component_id(trigger)
    start_frame = round(float(trigger.get("transcriptStart", 0)) * fps)
    end_frame = max(start_frame + 1, round(float(trigger.get("transcriptEnd", 0)) * fps))
    entry_id = f"entry-{trigger_id}-promoted"

    tracks = next_tl.setdefault("tracks", {})
    mg = list(tracks.get("motionGraphics", []))
    mg.append(
        {
            "id": entry_id,
            "componentId": comp_id,
            "startFrame": start_frame,
            "durationInFrames": end_frame - start_frame,
            "layerDepth": _layer_depth(comp_id),
            "props": (trigger.get("metadata") or {}).get("props") or {},
            "triggerId": trigger_id,
        }
    )
    tracks["motionGraphics"] = mg

    next_tl["triggers"] = [
        (
            {**t, "status": "realized", "resultingEntryId": entry_id}
            if t.get("id") == trigger_id
            else t
        )
        for t in next_tl.get("triggers", [])
    ]
    return next_tl


def swap_timeline_component(
    timeline: dict[str, Any],
    entry_id: str,
    new_component_id: str,
    props: dict[str, Any] | None = None,
) -> dict[str, Any]:
    next_tl = copy.deepcopy(timeline)
    tracks = next_tl.setdefault("tracks", {})
    mg = []
    for entry in tracks.get("motionGraphics", []):
        if entry.get("id") != entry_id:
            mg.append(entry)
            continue
        mg.append(
            {
                **entry,
                "componentId": new_component_id,
                "layerDepth": _layer_depth(new_component_id),
                "props": props if props is not None else entry.get("props", {}),
            }
        )
    tracks["motionGraphics"] = mg
    return next_tl


def reroll_broll_entry(
    timeline: dict[str, Any],
    entry_id: str,
    search_query: str,
    *,
    content_type: str = "podcast",
) -> dict[str, Any]:
    return reroll_broll_with_pexels(
        timeline,
        entry_id,
        search_query,
        content_type=content_type,
    )
