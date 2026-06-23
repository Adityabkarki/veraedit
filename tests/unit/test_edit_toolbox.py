"""Tests for the edit toolbox registry and brand merge."""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "apps" / "api"))

from tasks.style_transfer.edit_toolbox import (
    EDIT_TOOLBOX,
    CapabilityStatus,
    discover_all_tool_ids,
    discover_tool_ids_from_recipe,
    list_all_tools,
    resolve_tool_ids_for_event,
)
from tasks.style_transfer.toolbox_store import (
    discovered_tool_ids,
    merge_tools_into_brand_dna,
)


def test_toolbox_has_core_shorts_tools():
    assert "jump_cut_pacing" in EDIT_TOOLBOX
    assert "digital_zoom_punch" in EDIT_TOOLBOX
    assert "screen_broll_cutaway" in EDIT_TOOLBOX
    assert "sfx_on_cut" in EDIT_TOOLBOX


def test_resolve_screen_broll_vs_generic():
    screen = resolve_tool_ids_for_event("broll", {
        "broll_type": "screen_recording",
        "visual_type": "screen_recording",
    })
    generic = resolve_tool_ids_for_event("broll", {"visual_type": "broll_insert"})
    assert "screen_broll_cutaway" in screen
    assert "broll_insert" in generic
    assert "screen_broll_cutaway" not in generic


def test_discover_from_recipe_events():
    recipe = {
        "events": [
            {"kind": "jump_cut_pacing", "params": {}},
            {"kind": "digital_zoom", "params": {"scale_end": 1.12}},
            {"kind": "sfx", "params": {"sfx_type": "whoosh"}},
            {"kind": "hook", "params": {"visual_type": "title_banner"}},
        ],
    }
    ids = discover_tool_ids_from_recipe(recipe)
    assert "jump_cut_pacing" in ids
    assert "digital_zoom_punch" in ids
    assert "sfx_whoosh_cut" in ids or "sfx_on_cut" in ids
    assert "title_hook_banner" in ids


def test_merge_toolbox_into_brand():
    dna = merge_tools_into_brand_dna(
        {"presets": []},
        ["jump_cut_pacing", "music_bed"],
        "preset-1",
        "Test Short",
    )
    found = discovered_tool_ids(dna)
    assert "jump_cut_pacing" in found
    assert "music_bed" in found
    entry = dna["toolbox"]["discovered"]["jump_cut_pacing"]
    assert entry["use_count"] == 1
    assert "preset-1" in entry["preset_ids"]


def test_discover_all_unions_recipe_and_vision():
    recipe = {
        "events": [{"kind": "color_grade", "params": {}}],
        "vision": {
            "detected_edits": [
                {"kind": "digital_zoom", "params": {}},
            ],
        },
    }
    ids = discover_all_tool_ids(recipe=recipe)
    assert "color_grade" in ids
    assert "digital_zoom_punch" in ids


def test_list_all_tools_core_always_available_without_discovery():
    """Supported tools are available in the app even before any extraction."""
    tools = list_all_tools(frozenset(), core_always_available=True)
    whoosh = next(t for t in tools if t["id"] == "sfx_whoosh_cut")
    assert whoosh["available"] is True
    assert whoosh["discovered"] is True
    missing = [t for t in tools if t["status"] == CapabilityStatus.MISSING.value]
    for tool in missing:
        assert tool["available"] is False
