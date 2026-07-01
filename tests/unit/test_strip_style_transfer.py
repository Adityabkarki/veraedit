"""Strip prior style-transfer layers before re-apply."""
from tasks.style_transfer.edit_recipe import EditRecipe, EditRecipeEvent
from tasks.style_transfer.recipe_applicator import RecipeApplicator
from tasks.style_transfer.strip_style_transfer import strip_prior_style_transfer


def _timeline() -> dict:
    return {
        "global_settings": {"duration": 60.0},
        "tracks": [
            {
                "id": "v1",
                "type": "video",
                "clips": [{
                    "id": "clip-1",
                    "timeline_start": 0.0,
                    "timeline_end": 60.0,
                    "effects": [],
                    "transitions": {},
                }],
            },
            {
                "id": "o1",
                "type": "overlay",
                "clips": [{
                    "id": "recipe-broll-abc",
                    "timeline_start": 5.0,
                    "timeline_end": 8.0,
                    "effects": [{
                        "type": "visual_overlay",
                        "params": {"style_transfer": True, "visual_type": "broll_overlay"},
                    }],
                }],
            },
        ],
        "metadata": {"edit_template": {"preset_name": "old"}},
    }


def test_strip_removes_recipe_overlays():
    data = strip_prior_style_transfer(_timeline())
    overlay = next(t for t in data["tracks"] if t["type"] == "overlay")
    assert overlay["clips"] == []
    assert "edit_template" not in data["metadata"]


def test_reapply_replaces_not_stacks_overlays():
    recipe_a = EditRecipe(
        reference_duration_s=25.0,
        events=[
            EditRecipeEvent(kind="broll", start_pct=0.2, end_pct=0.28, params={}),
        ],
    )
    recipe_b = EditRecipe(
        reference_duration_s=11.0,
        events=[
            EditRecipeEvent(kind="lower_third", start_pct=0.5, end_pct=0.65, params={}),
        ],
    )
    applicator = RecipeApplicator()
    after_a = applicator.apply(_timeline(), recipe_a, strength=1.0, preset_id="a")
    after_b = applicator.apply(after_a, recipe_b, strength=1.0, preset_id="b")

    overlay = next(t for t in after_b["tracks"] if t["type"] == "overlay")
    assert len(overlay["clips"]) == 1
    assert overlay["clips"][0]["effects"][0]["params"].get("toolbox_id") == "lower_third"
    start = overlay["clips"][0]["timeline_start"]
    assert 28 < start < 32  # 50% of 60s
