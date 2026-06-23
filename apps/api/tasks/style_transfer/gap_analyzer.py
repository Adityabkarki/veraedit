"""
Build effect inventory from extracted references using the edit toolbox.
"""
from __future__ import annotations

from typing import Any

from tasks.style_transfer.edit_toolbox import (
    build_effect_inventory as toolbox_inventory_rows,
    build_gap_report_from_tools,
    discover_all_tool_ids,
)
from tasks.style_transfer.models import StyleDNA


def build_effect_inventory(
    dna: StyleDNA,
    vision_effect_ids: list[str] | None = None,
    recipe: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    tool_ids = discover_all_tool_ids(
        recipe=recipe,
        vision=recipe.get("vision") if isinstance(recipe, dict) else None,
        effect_ids=vision_effect_ids,
    )
    if not tool_ids:
        tool_ids = _detect_tool_ids_from_dna(dna, vision_effect_ids)
    return toolbox_inventory_rows(tool_ids)


def _detect_tool_ids_from_dna(
    dna: StyleDNA,
    extra_ids: list[str] | None = None,
) -> list[str]:
    """Heuristic toolbox IDs from StyleDNA when vision/recipe are sparse."""
    detected: list[str] = []

    cap = dna.captions
    if cap.animation == "word-by-word":
        detected.append("caption_word_by_word")
    elif cap.animation == "slide":
        detected.append("caption_slide")
    elif cap.font_size_vw > 0:
        detected.append("caption_pop")

    trans = dna.transitions
    if trans.primary_type in ("cut", ""):
        detected.append("hard_cut")
    elif trans.primary_type == "fade":
        detected.append("fade_transition")
    elif trans.primary_type == "dissolve":
        detected.append("dissolve_transition")
    elif trans.primary_type == "zoom":
        detected.append("zoom_transition")
    elif trans.primary_type == "whip_pan":
        detected.append("whip_pan")

    if abs(dna.color.brightness) > 0.02 or abs(dna.color.contrast) > 0.02:
        detected.append("color_grade")

    if dna.pacing.cuts_per_minute > 18:
        detected.append("jump_cut_pacing")

    vis = dna.visuals
    if vis.uses_text_overlays:
        detected.append("text_overlay")
    if vis.text_style in ("bold", "corporate"):
        detected.append("lower_third")

    if dna.hook.uses_text_hook_overlay:
        detected.append("hook_text_overlay")

    if dna.broll.frequency in ("medium", "high"):
        detected.append("broll_insert")

    if dna.audio.music_energy in ("low", "medium", "high"):
        detected.append("music_bed")
    if dna.transitions.uses_sound_effects:
        detected.append("sfx_on_cut")

    if extra_ids:
        detected.extend(extra_ids)

    seen: set[str] = set()
    unique: list[str] = []
    for e in detected:
        if e not in seen:
            seen.add(e)
            unique.append(e)
    return unique


def build_gap_report(
    dna: StyleDNA,
    vision_effect_ids: list[str] | None = None,
    recipe: dict[str, Any] | None = None,
) -> dict[str, Any]:
    tool_ids = discover_all_tool_ids(
        recipe=recipe,
        vision=recipe.get("vision") if isinstance(recipe, dict) else None,
        effect_ids=vision_effect_ids,
    )
    if not tool_ids:
        tool_ids = _detect_tool_ids_from_dna(dna, vision_effect_ids)
    return build_gap_report_from_tools(tool_ids)
