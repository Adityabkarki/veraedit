"""Recipe applicator capability registry integration."""
from tasks.style_transfer.edit_recipe import EditRecipe, EditRecipeEvent
from tasks.style_transfer.recipe_applicator import RecipeApplicator


def _empty_timeline(duration: float = 60.0) -> dict:
    return {
        "global_settings": {"duration": duration},
        "tracks": [
            {
                "id": "v1",
                "type": "video",
                "clips": [{
                    "id": "clip-1",
                    "timeline_start": 0.0,
                    "timeline_end": duration,
                    "source_start": 0.0,
                    "source_end": duration,
                    "effects": [],
                    "transitions": {},
                }],
            },
        ],
        "metadata": {},
    }


def test_recipe_applicator_skips_unimplemented_registry_effects():
    recipe = EditRecipe(
        reference_duration_s=25.0,
        events=[
            EditRecipeEvent(
                kind="transition_glitch",
                start_pct=0.2,
                end_pct=0.2,
                params={"transition_type": "glitch"},
            ),
        ],
    )
    applicator = RecipeApplicator()
    applicator.apply(_empty_timeline(), recipe, strength=1.0)
    assert applicator.skipped_effects
    assert applicator.skipped_effects[0]["reason"] == "renderer_not_implemented"


def test_recipe_applicator_apply_summary_in_metadata():
    recipe = EditRecipe(
        reference_duration_s=10.0,
        events=[
            EditRecipeEvent(kind="color_grade", start_pct=0, end_pct=1, params={}),
        ],
    )
    applicator = RecipeApplicator()
    result = applicator.apply(_empty_timeline(30.0), recipe, strength=1.0)
    summary = result["metadata"]["edit_template"]["apply_summary"]
    assert "applied_count" in summary
    assert "skipped_count" in summary
