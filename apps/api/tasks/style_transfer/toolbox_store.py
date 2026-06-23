"""
Persist discovered edit tools into Brand.style_dna["toolbox"].

Each reference extraction merges newly found tools so the user's toolbox grows.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .edit_toolbox import discover_all_tool_ids


def get_toolbox_state(brand_style_dna: dict[str, Any] | None) -> dict[str, Any]:
    if not brand_style_dna:
        return {"discovered": {}, "version": 1}
    tb = brand_style_dna.get("toolbox")
    if not isinstance(tb, dict):
        return {"discovered": {}, "version": 1}
    discovered = tb.get("discovered")
    if not isinstance(discovered, dict):
        discovered = {}
    return {"discovered": discovered, "version": int(tb.get("version", 1))}


def merge_tools_into_brand_dna(
    brand_style_dna: dict[str, Any] | None,
    tool_ids: list[str],
    preset_id: str,
    preset_name: str = "",
) -> dict[str, Any]:
    """
    Add tool_ids to brand toolbox discovered set.
    Returns updated brand_style_dna dict (mutates copy).
    """
    dna = dict(brand_style_dna) if brand_style_dna else {}
    tb = get_toolbox_state(dna)
    discovered: dict[str, Any] = dict(tb["discovered"])
    now = datetime.now(timezone.utc).isoformat()

    for tid in tool_ids:
        entry = discovered.get(tid)
        if not isinstance(entry, dict):
            entry = {
                "first_seen_at": now,
                "last_seen_at": now,
                "use_count": 0,
                "preset_ids": [],
                "preset_names": [],
            }
        entry["last_seen_at"] = now
        entry["use_count"] = int(entry.get("use_count", 0)) + 1
        pids: list[str] = list(entry.get("preset_ids") or [])
        if preset_id and preset_id not in pids:
            pids.append(preset_id)
            entry["preset_ids"] = pids[-20:]
        names: list[str] = list(entry.get("preset_names") or [])
        if preset_name and preset_name not in names:
            names.append(preset_name)
            entry["preset_names"] = names[-20:]
        discovered[tid] = entry

    dna["toolbox"] = {
        "version": 1,
        "discovered": discovered,
        "updated_at": now,
    }
    return dna


def discovered_tool_ids(brand_style_dna: dict[str, Any] | None) -> set[str]:
    return set(get_toolbox_state(brand_style_dna)["discovered"].keys())


def preset_ids_by_tool(brand_style_dna: dict[str, Any] | None) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for tid, entry in get_toolbox_state(brand_style_dna)["discovered"].items():
        if isinstance(entry, dict):
            out[tid] = list(entry.get("preset_ids") or [])
    return out


def merge_tools_from_preset(
    brand_style_dna: dict[str, Any] | None,
    preset_dict: dict[str, Any],
) -> dict[str, Any]:
    """Discover tools from a saved preset and merge into brand DNA."""
    tool_ids = discover_all_tool_ids(
        recipe=preset_dict.get("edit_recipe"),
        effect_ids=[
            e.get("id") for e in (preset_dict.get("effect_inventory") or [])
            if isinstance(e, dict) and e.get("id")
        ],
    )
    return merge_tools_into_brand_dna(
        brand_style_dna,
        tool_ids,
        str(preset_dict.get("id", "")),
        str(preset_dict.get("name", "")),
    )
