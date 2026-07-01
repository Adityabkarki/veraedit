"""Capability registry — maps vision-model effect descriptions to toolbox IDs."""
from __future__ import annotations

import json
from difflib import SequenceMatcher
from functools import lru_cache
from pathlib import Path
from typing import Any

REGISTRY_PATH = Path(__file__).resolve().parent.parent / "data" / "capability_registry.json"

# Recipe event kinds that are always applied (global / structural).
GLOBAL_EVENT_KINDS = frozenset({
    "color_grade",
    "caption_style",
    "jump_cut_pacing",
    "music_bed",
})

# Map EditRecipeEvent.kind → registry toolbox_id.
EVENT_KIND_TO_TOOLBOX: dict[str, str] = {
    "hook": "hook_text_overlay",
    "lower_third": "lower_third",
    "cta": "cta_overlay",
    "graphic": "text_overlay",
    "hard_cut": "transition_hard_cut",
    "transition_cut": "transition_hard_cut",
    "transition_zoom": "transition_zoom",
    "transition_whip_pan": "transition_whip_pan",
    "transition_whip": "transition_whip_pan",
    "transition_dissolve": "transition_crossfade",
    "transition_fade": "transition_crossfade",
    "transition_crossfade": "transition_crossfade",
    "sfx": "sfx_whoosh",
    "broll": "broll_illustrative",
    "zoom": "zoom_ken_burns",
    "digital_zoom": "zoom_ken_burns",
    "jump_cut_pacing": "jump_cut_pacing",
    "music_bed": "music_duck",
    "color_grade": "color_warm",
    "caption_style": "caption_sentence",
    "split_screen": "text_overlay",
    "picture_in_picture": "broll_illustrative",
    "logo": "text_overlay",
}


@lru_cache(maxsize=1)
def load_registry() -> dict[str, Any]:
    with open(REGISTRY_PATH, encoding="utf-8") as f:
        data = json.load(f)
    alias_map: dict[str, dict[str, Any]] = {}
    for cap in data["capabilities"]:
        for alias in cap.get("detection_aliases") or []:
            alias_map[str(alias).lower()] = cap
        alias_map[cap["toolbox_id"].lower()] = cap
        alias_map[str(cap["display_name"]).lower()] = cap
    data["_alias_map"] = alias_map
    return data


def normalize_effect_to_toolbox_id(raw_description: str) -> dict[str, Any] | None:
    """
    Map a free-text effect description to a capability dict, or None if unknown.
    """
    registry = load_registry()
    alias_map: dict[str, dict[str, Any]] = registry["_alias_map"]
    raw_lower = raw_description.lower().strip()
    if not raw_lower:
        return None

    if raw_lower in alias_map:
        return alias_map[raw_lower]

    for alias, cap in alias_map.items():
        if alias in raw_lower or raw_lower in alias:
            return cap

    best_cap: dict[str, Any] | None = None
    best_score = 0.0
    for alias, cap in alias_map.items():
        score = SequenceMatcher(None, raw_lower, alias).ratio()
        if score > best_score:
            best_score = score
            best_cap = cap

    if best_score >= 0.65 and best_cap is not None:
        return best_cap

    return None


def get_capability(toolbox_id: str) -> dict[str, Any] | None:
    if not toolbox_id or not isinstance(toolbox_id, str):
        return None
    registry = load_registry()
    for cap in registry["capabilities"]:
        if cap["toolbox_id"] == toolbox_id:
            return cap
    return normalize_effect_to_toolbox_id(toolbox_id)


def get_implemented_capabilities() -> list[dict[str, Any]]:
    return [c for c in load_registry()["capabilities"] if c.get("is_implemented")]


def get_unimplemented_capabilities() -> list[dict[str, Any]]:
    return [c for c in load_registry()["capabilities"] if not c.get("is_implemented")]


def build_gap_report(detected_effects: list[str]) -> dict[str, Any]:
    """Structured gap report from raw vision / detection strings."""
    implemented: list[dict[str, Any]] = []
    partial: list[dict[str, Any]] = []
    unresolvable: list[dict[str, Any]] = []
    seen_toolbox: set[str] = set()

    for raw in detected_effects:
        raw = str(raw).strip()
        if not raw:
            continue
        cap = normalize_effect_to_toolbox_id(raw)
        if cap is None:
            unresolvable.append({"raw_description": raw})
            continue

        tid = cap["toolbox_id"]
        if tid in seen_toolbox:
            continue
        seen_toolbox.add(tid)

        if cap.get("is_implemented"):
            implemented.append({
                "toolbox_id": tid,
                "display_name": cap["display_name"],
                "category": cap["category"],
                "raw_description": raw,
                "renderer": cap.get("renderer"),
                "status": "supported",
            })
        else:
            partial.append({
                "toolbox_id": tid,
                "display_name": cap["display_name"],
                "category": cap["category"],
                "raw_description": raw,
                "reason": "Renderer not yet built for this effect",
                "status": "partial",
            })

    total = len(implemented) + len(partial) + len(unresolvable)
    coverage = int((len(implemented) / total) * 100) if total else 0

    return {
        "total_detected": total,
        "implemented": implemented,
        "partial": partial,
        "unresolvable": unresolvable,
        "coverage_pct": coverage,
    }


def inventory_from_gap_report(gap_report: dict[str, Any]) -> list[dict[str, Any]]:
    """Effect inventory rows compatible with existing toolbox consumers."""
    items: list[dict[str, Any]] = []
    for entry in gap_report.get("implemented") or []:
        items.append({
            "id": entry["toolbox_id"],
            "toolbox_id": entry["toolbox_id"],
            "name": entry["display_name"],
            "category": entry["category"],
            "status": "supported",
            "renderer": entry.get("renderer"),
        })
    for entry in gap_report.get("partial") or []:
        items.append({
            "id": entry["toolbox_id"],
            "toolbox_id": entry["toolbox_id"],
            "name": entry["display_name"],
            "category": entry["category"],
            "status": "partial",
            "renderer": None,
            "partial_reason": entry.get("reason"),
        })
    for entry in gap_report.get("unresolvable") or []:
        items.append({
            "id": None,
            "toolbox_id": None,
            "name": entry["raw_description"],
            "category": "unknown",
            "status": "unsupported",
            "renderer": None,
        })
    return items


def toolbox_id_for_event_kind(kind: str, params: dict[str, Any] | None = None) -> str | None:
    if params and params.get("toolbox_id"):
        return str(params["toolbox_id"])
    direct = get_capability(kind)
    if direct:
        return direct["toolbox_id"]
    if kind in EVENT_KIND_TO_TOOLBOX:
        return EVENT_KIND_TO_TOOLBOX[kind]
    if kind.startswith("transition_"):
        cap = normalize_effect_to_toolbox_id(kind.replace("_", " "))
        return cap["toolbox_id"] if cap else None
    cap = normalize_effect_to_toolbox_id(kind.replace("_", " "))
    return cap["toolbox_id"] if cap else None


def event_allowed_by_registry(
    kind: str,
    params: dict[str, Any] | None,
    strength: float,
) -> tuple[bool, str | None, str | None]:
    """
    Returns (allowed, toolbox_id, skip_reason).
    Global kinds always pass.
    """
    if kind in GLOBAL_EVENT_KINDS:
        return True, toolbox_id_for_event_kind(kind, params), None

    tid = toolbox_id_for_event_kind(kind, params)
    if not tid:
        return True, None, None

    cap = get_capability(tid)
    if cap is None:
        return False, tid, "not_in_registry"

    if not cap.get("is_implemented"):
        return False, cap["toolbox_id"], "renderer_not_implemented"

    confidence = float((params or {}).get("confidence", 1.0))
    if confidence < strength:
        return False, cap["toolbox_id"], "below_strength_threshold"

    return True, cap["toolbox_id"], None
