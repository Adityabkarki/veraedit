"""Phase 10 Part 3 — section-anchor timing, music bed, B-roll gap resolution."""
from __future__ import annotations

import pathlib
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "apps" / "api"))

from tasks.style_transfer.edit_recipe import EditRecipe, EditRecipeEvent
from tasks.style_transfer.recipe_applicator import RecipeApplicator


def test_scale_timestamp_hook_lands_in_first_10_seconds():
    start, end = RecipeApplicator._scale_timestamp(0.05, 0.10, 180.0)
    assert 0.0 <= start <= 10.0
    assert 0.0 < end <= 10.0
    assert end > start


def test_scale_timestamp_cta_lands_in_last_20_seconds():
    start, end = RecipeApplicator._scale_timestamp(0.90, 0.95, 180.0)
    assert start >= 160.0
    assert end <= 180.0
    assert end > start


def test_scale_timestamp_short_video_uses_proportional():
    start, end = RecipeApplicator._scale_timestamp(0.25, 0.75, 20.0)
    assert start == pytest.approx(5.0)
    assert end == pytest.approx(15.0)


def test_get_zone():
    assert RecipeApplicator._get_zone(0.05) == "hook"
    assert RecipeApplicator._get_zone(0.50) == "body"
    assert RecipeApplicator._get_zone(0.90) == "cta"


def _timeline(duration: float = 180.0) -> dict:
    return {
        "global_settings": {"duration": duration},
        "tracks": [{
            "id": "v1", "type": "video", "name": "V",
            "clips": [{
                "id": "c1", "timeline_start": 0, "timeline_end": duration,
                "source_start": 0, "source_end": duration,
                "effects": [], "transitions": {},
            }],
        }],
        "metadata": {},
    }


def test_hook_overlay_uses_hook_zone_on_long_video():
    recipe = EditRecipe(
        reference_duration_s=25.0,
        events=[
            EditRecipeEvent(kind="hook", start_pct=0.05, end_pct=0.15, params={}),
            EditRecipeEvent(kind="cta", start_pct=0.90, end_pct=0.98, params={}),
        ],
    )
    result = RecipeApplicator().apply(_timeline(180.0), recipe, strength=1.0)
    overlay = next(t for t in result["tracks"] if t["type"] == "overlay")
    starts = sorted(c["timeline_start"] for c in overlay["clips"])
    assert starts[0] <= 10.0
    assert starts[-1] >= 160.0


def test_broll_missing_writes_gap_placeholder():
    recipe = EditRecipe(
        reference_duration_s=30.0,
        events=[
            EditRecipeEvent(
                kind="broll",
                start_pct=0.4,
                end_pct=0.55,
                label="Office walkthrough",
                params={"shot_type": "b_roll", "energy_level": "moderate"},
            ),
        ],
    )
    result = RecipeApplicator().apply(
        _timeline(60.0), recipe, strength=1.0, library_assets=[],
    )
    overlay = next(t for t in result["tracks"] if t["type"] == "overlay")
    assert len(overlay["clips"]) == 1
    clip = overlay["clips"][0]
    assert clip["gap_resolution_needed"] is True
    assert clip["gap_metadata"]["match_status"] == "missing"


def test_broll_matched_uses_library_asset():
    recipe = EditRecipe(
        reference_duration_s=30.0,
        events=[
            EditRecipeEvent(
                kind="broll",
                start_pct=0.4,
                end_pct=0.55,
                label="Office walkthrough",
                params={"shot_type": "b_roll", "energy_level": "moderate"},
            ),
        ],
    )
    library = [{
        "id": "asset-1",
        "asset_type": "video",
        "storage_key": "library/test.mp4",
        "tags": {
            "shot_type": "b_roll",
            "energy_level": "moderate",
            "duration_seconds": 5.0,
            "has_face": False,
            "setting": "office",
        },
    }]
    with patch("processors.storage_helpers.S3Storage") as mock_s3:
        mock_s3.return_value.get_presigned_url.return_value = "https://example.com/test.mp4"
        result = RecipeApplicator().apply(
            _timeline(60.0), recipe, strength=1.0, library_assets=library,
        )
    overlay = next(t for t in result["tracks"] if t["type"] == "overlay")
    clip = overlay["clips"][0]
    assert clip["asset_id"] == "asset-1"
    assert clip["gap_metadata"]["match_status"] == "matched"


def test_music_bed_places_real_track_when_profile_set():
    recipe = EditRecipe(
        reference_duration_s=25.0,
        events=[EditRecipeEvent(kind="music_bed", start_pct=0, end_pct=1, params={})],
    )
    mock_storage = MagicMock()
    with patch("processors.storage_helpers.S3Storage", return_value=mock_storage):
        with patch(
            "processors.music_library.pick_music_for_mood",
            return_value=pathlib.Path("/fake/upbeat_1.mp3"),
        ):
            with patch("pathlib.Path.exists", return_value=True):
                result = RecipeApplicator().apply(
                    _timeline(60.0),
                    recipe,
                    strength=1.0,
                    project_id="proj-1",
                    audio_profile={
                        "music_genre": "upbeat",
                        "music_energy_arc": "high throughout",
                        "music_ducking_behavior": "music drops significantly under VO",
                    },
                )
    music = next(t for t in result["tracks"] if t["type"] == "music")
    clip = music["clips"][0]
    params = clip["effects"][0]["params"]
    assert params["is_placeholder"] is False
    assert params["duck_under_voice"] is True
    assert params.get("storage_key")
    mock_storage.put_file.assert_called_once()


def test_get_music_track_metadata():
    from processors.music_library import get_music_track_metadata

    meta = get_music_track_metadata("upbeat_2.mp3")
    assert meta["title"] == "Upbeat 2"
    assert meta["filename"] == "upbeat_2.mp3"
