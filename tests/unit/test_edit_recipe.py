"""Tests for edit recipe builder and applicator."""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "apps" / "api"))

from tasks.style_transfer.edit_recipe import build_edit_recipe, EditRecipe
from tasks.style_transfer.models import StyleDNA, HookProfile, VisualProfile, TransitionProfile
from tasks.style_transfer.recipe_applicator import RecipeApplicator


def _scenes():
    return [
        {"start_ms": 0, "end_ms": 3000, "duration_ms": 3000},
        {"start_ms": 3000, "end_ms": 5500, "duration_ms": 2500},
        {"start_ms": 5500, "end_ms": 10000, "duration_ms": 4500},
    ]


def test_build_edit_recipe_includes_global_and_cuts():
    dna = StyleDNA(
        hook=HookProfile(uses_text_hook_overlay=True, hook_type="reaction"),
        visuals=VisualProfile(uses_text_overlays=True, overlay_density="moderate"),
        transitions=TransitionProfile(primary_type="zoom", avg_duration_ms=200),
    )
    recipe = build_edit_recipe(dna, _scenes(), reference_duration_s=10.0)
    kinds = {e.kind for e in recipe.events}
    assert "color_grade" in kinds
    assert "caption_style" in kinds
    assert "hook" in kinds
    assert any(k.startswith("transition") or k == "hard_cut" for k in kinds)
    assert recipe.reference_duration_s == 10.0


def test_recipe_applicator_scales_to_target_duration():
    dna = StyleDNA()
    recipe = build_edit_recipe(
        StyleDNA(hook=HookProfile(uses_text_hook_overlay=True)),
        _scenes(),
        10.0,
    )
    timeline = {
        "global_settings": {"duration": 30.0},
        "tracks": [
            {
                "id": "v1", "type": "video", "name": "V",
                "clips": [{
                    "id": "c1", "timeline_start": 0, "timeline_end": 30,
                    "source_start": 0, "source_end": 30,
                    "effects": [], "transitions": {},
                }],
            },
            {
                "id": "cap", "type": "captions", "name": "C",
                "clips": [{
                    "id": "cap1", "timeline_start": 0, "timeline_end": 5,
                    "label": "Nepali text here", "effects": [], "transitions": {},
                }],
            },
        ],
        "metadata": {},
    }
    result = RecipeApplicator().apply(timeline, recipe, dna, strength=1.0, preset_name="Test")
    meta = result["metadata"]["edit_template"]
    assert meta["target_duration_s"] == 30.0
    assert meta["events_applied"] > 0
    overlay = next(t for t in result["tracks"] if t["type"] == "overlay")
    assert len(overlay["clips"]) >= 1
    hook = overlay["clips"][0]
    assert hook["effects"][0]["params"]["is_placeholder"] is True
    assert "Nepali" in result["tracks"][1]["clips"][0]["label"]


def test_recipe_does_not_split_video_clips():
    dna = StyleDNA()
    recipe = EditRecipe.from_dict(build_edit_recipe(dna, _scenes(), 10.0).to_dict())
    timeline = {
        "global_settings": {"duration": 180.0},
        "tracks": [{
            "id": "v1", "type": "video", "name": "V",
            "clips": [{
                "id": "c1", "timeline_start": 0, "timeline_end": 180,
                "source_start": 0, "source_end": 180,
                "effects": [], "transitions": {},
            }],
        }],
        "metadata": {},
    }
    result = RecipeApplicator().apply(timeline, recipe, dna)
    video = next(t for t in result["tracks"] if t["type"] == "video")
    assert len(video["clips"]) == 1
