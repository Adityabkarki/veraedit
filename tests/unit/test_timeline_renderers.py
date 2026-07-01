"""EP-10.4 timeline renderer metadata tests."""
from tasks.style_transfer.edit_recipe import EditRecipe, EditRecipeEvent
from tasks.style_transfer.recipe_applicator import RecipeApplicator
from tasks.style_transfer.timeline_renderers import (
    overlay_renderer_params,
    transition_out_payload,
)


def test_overlay_renderer_params_lower_third():
    meta = overlay_renderer_params("lower_third", {})
    assert meta["renderer"] == "remotion_lower_third"
    assert meta["toolbox_id"] == "lower_third"
    assert meta["visual_type"] == "lower_third"


def test_overlay_renderer_params_hook():
    meta = overlay_renderer_params("hook", {})
    assert meta["renderer"] == "remotion_title_card"
    assert meta["zone"] == "hook"


def test_transition_out_payload_zoom():
    payload = transition_out_payload(
        "transition_zoom",
        {"transition_type": "zoom", "duration_ms": 300},
        strength=1.0,
    )
    assert payload["type"] == "zoom"
    assert payload["ffmpeg_filter"] == "zoompan"
    assert payload["toolbox_id"] == "transition_zoom"


def _timeline(duration: float = 30.0) -> dict:
    return {
        "global_settings": {"duration": duration},
        "tracks": [{
            "id": "v1",
            "type": "video",
            "clips": [
                {
                    "id": "c1",
                    "timeline_start": 0.0,
                    "timeline_end": 15.0,
                    "effects": [],
                    "transitions": {},
                },
                {
                    "id": "c2",
                    "timeline_start": 15.0,
                    "timeline_end": duration,
                    "effects": [],
                    "transitions": {},
                },
            ],
        }],
        "metadata": {},
    }


def test_recipe_applicator_lower_third_renderer_metadata():
    recipe = EditRecipe(
        reference_duration_s=10.0,
        events=[
            EditRecipeEvent(
                kind="lower_third",
                start_pct=0.1,
                end_pct=0.25,
                params={},
            ),
        ],
    )
    applicator = RecipeApplicator()
    result = applicator.apply(_timeline(), recipe, strength=1.0)
    overlay_track = next(t for t in result["tracks"] if t["type"] == "overlay")
    params = overlay_track["clips"][0]["effects"][0]["params"]
    assert params["renderer"] == "remotion_lower_third"
    assert params["toolbox_id"] == "lower_third"


def test_snap_to_nearest_cut():
    applicator = RecipeApplicator()
    snapped = applicator._snap_to_nearest_cut(_timeline(), 14.2)
    assert abs(snapped - 15.0) < 0.01
