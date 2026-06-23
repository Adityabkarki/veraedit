"""Tests for jump-cut formula and timeline-visible SFX/music slots."""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "apps" / "api"))

from tasks.style_transfer.edit_recipe import EditRecipe, EditRecipeEvent
from tasks.style_transfer.pacing_ops import (
    add_sfx_timeline_clip,
    apply_jump_cut_formula,
    remap_time_after_removals,
    ripple_remove_time_ranges,
)
from tasks.style_transfer.recipe_applicator import RecipeApplicator


def _timeline(duration: float = 60.0) -> dict:
    return {
        "global_settings": {"duration": duration},
        "tracks": [
            {
                "id": "v1",
                "type": "video",
                "clips": [{
                    "id": "c1",
                    "timeline_start": 0,
                    "timeline_end": duration,
                    "source_start": 0,
                    "source_end": duration,
                    "effects": [],
                    "transitions": {},
                }],
            },
            {
                "id": "a1",
                "type": "audio",
                "clips": [{
                    "id": "a1",
                    "timeline_start": 0,
                    "timeline_end": duration,
                    "source_start": 0,
                    "source_end": duration,
                    "effects": [],
                    "transitions": {},
                }],
            },
        ],
        "metadata": {},
    }


def test_jump_cut_splits_long_video():
    data = _timeline(45.0)
    result = apply_jump_cut_formula(
        data,
        avg_cut_duration_ms=2500,
        silence_tolerance_ms=200,
        strength=1.0,
    )
    video = next(t for t in data["tracks"] if t["type"] == "video")
    assert result["clips_after"] > 1
    assert len(video["clips"]) == result["clips_after"]


def test_silence_trim_shortens_timeline():
    data = _timeline(20.0)
    words = [
        {"word": "a", "start": 0.0, "end": 1.0},
        {"word": "b", "start": 4.0, "end": 5.0},
        {"word": "c", "start": 5.2, "end": 6.0},
    ]
    apply_jump_cut_formula(
        data,
        avg_cut_duration_ms=8000,
        silence_tolerance_ms=150,
        strength=1.0,
        transcript_words=words,
    )
    assert data["global_settings"]["duration"] < 20.0


def test_sfx_and_music_visible_on_tracks():
    data = _timeline(30.0)
    add_sfx_timeline_clip(data, 2.5, "whoosh", 0.35)
    from tasks.style_transfer.pacing_ops import add_music_bed_timeline_clip
    add_music_bed_timeline_clip(data, 30.0, {"music_energy": "medium"}, 1.0)
    sfx = next(
        t for t in data["tracks"]
        if t["type"] == "audio" and "sfx" in str(t.get("name", "")).lower()
    )
    music = next(t for t in data["tracks"] if t["type"] == "music")
    assert len(sfx["clips"]) == 1
    assert sfx["clips"][0]["effects"][0]["type"] == "sfx_slot"
    assert len(music["clips"]) == 1
    assert music["clips"][0]["effects"][0]["type"] == "music_bed"


def test_recipe_apply_jump_cut_and_sfx_clips():
    recipe = EditRecipe(
        reference_duration_s=30.0,
        events=[
            EditRecipeEvent(
                kind="jump_cut_pacing",
                start_pct=0,
                end_pct=1,
                params={
                    "avg_cut_duration_ms": 2000,
                    "silence_tolerance_ms": 200,
                    "remove_filler": False,
                },
            ),
            EditRecipeEvent(
                kind="sfx",
                start_pct=0.1,
                end_pct=0.1,
                params={"sfx_type": "whoosh", "volume": 0.3},
            ),
            EditRecipeEvent(
                kind="music_bed",
                start_pct=0,
                end_pct=1,
                params={"music_energy": "high"},
            ),
        ],
    )
    data = _timeline(40.0)
    out = RecipeApplicator().apply(data, recipe, strength=1.0)
    video = next(t for t in out["tracks"] if t["type"] == "video")
    assert len(video["clips"]) > 1
    sfx = next(
        (
            t for t in out["tracks"]
            if t["type"] == "audio" and "sfx" in str(t.get("name", "")).lower()
        ),
        None,
    )
    assert sfx is not None and len(sfx["clips"]) >= 1
    assert out["metadata"].get("content_formula", {}).get("policy") == "structure_only"


def test_sfx_stacks_second_lane_on_overlap():
    data = _timeline(30.0)
    add_sfx_timeline_clip(data, 2.0, "whoosh", 0.35)
    add_sfx_timeline_clip(data, 2.1, "click", 0.35)
    sfx_tracks = [
        t for t in data["tracks"]
        if t["type"] == "audio" and "sfx" in str(t.get("name", "")).lower()
    ]
    assert len(sfx_tracks) == 2
    assert len(sfx_tracks[0]["clips"]) == 1
    assert len(sfx_tracks[1]["clips"]) == 1


def test_remap_time_after_removals():
    removed = [(5.0, 7.0)]
    assert remap_time_after_removals(10.0, removed) == 8.0
    assert remap_time_after_removals(6.0, removed) == 5.0


def test_ripple_remove_keeps_source_start_before_source_end():
    """Middle removal must not invert source in/out on the tail segment."""
    data = _timeline(100.0)
    ripple_remove_time_ranges(data, [(10.0, 80.0)])
    video = next(t for t in data["tracks"] if t["type"] == "video")
    assert len(video["clips"]) == 2
    for clip in video["clips"]:
        ss = float(clip["source_start"])
        se = float(clip["source_end"])
        assert se > ss, f"bad source range: {ss}..{se}"
    tail = max(video["clips"], key=lambda c: float(c["source_start"]))
    assert float(tail["source_start"]) >= 79.0
    assert float(tail["source_end"]) == 100.0


def test_jump_cut_with_transcript_keeps_valid_source_ranges():
    """Silence trim + pacing must not invert source in/out on any clip."""
    data = _timeline(60.0)
    words = [
        {"word": "a", "start": 0.0, "end": 1.0},
        {"word": "b", "start": 5.0, "end": 6.0},
        {"word": "c", "start": 12.0, "end": 13.0},
    ]
    apply_jump_cut_formula(
        data,
        avg_cut_duration_ms=2500,
        silence_tolerance_ms=150,
        strength=0.85,
        transcript_words=words,
        remove_filler=False,
    )
    all_ids: list[str] = []
    for track in data["tracks"]:
        for clip in track.get("clips", []):
            ss = float(clip["source_start"])
            se = float(clip["source_end"])
            assert se > ss, f"bad source on {clip.get('id')}: {ss}..{se}"
            all_ids.append(str(clip["id"]))
    assert len(all_ids) == len(set(all_ids))
