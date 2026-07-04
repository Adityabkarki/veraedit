"""Unit tests for motion_graphics_service (Code-as-Video)."""
from __future__ import annotations

from unittest.mock import patch

import pytest

from services.motion_graphics_service import (
    COMPONENT_REGISTRY,
    MAGIC_PRESETS,
    MOTION_GRAPHIC_TYPES,
    SPRING_PROFILES,
    apply_preset_layout,
    build_atomic_preset_plan,
    detect_content_type,
    direct_motion_plan,
    get_component_library,
    plan_from_timeline_clips,
    prepare_motion_assets,
    spring_for_type,
    suggest_motion_placements,
    validate_motion_plan,
)


def test_component_registry_has_rich_library():
    assert len(COMPONENT_REGISTRY) >= 60
    assert len(MOTION_GRAPHIC_TYPES) >= 60
    assert len(COMPONENT_REGISTRY) == len(MOTION_GRAPHIC_TYPES)
    for t in (
        "animated_title", "guest_intro", "eq_visualizer", "circular_waveform",
        "symmetric_audio_strip", "active_speaker_split", "strategy_funnel",
        "metric_ticker", "kinetic_karaoke", "vertical_clip_template",
        "dynamic_feature_callout",
        "broadcast_lower_third", "subscribe_badge", "device_mockup", "kinetic_line",
        "glass_card", "liquid_blob", "callout_line", "pie_chart", "funnel_chart",
        "corporate_timeline", "parallax_slide", "icon_pop", "whip_transition",
        "zoom_transition", "split_screen", "grid_layout", "glitch_overlay",
        "paper_rip", "collage_frame", "karaoke_caption", "doodle_scribble",
        "hud_grid", "hud_loader", "geometric_pattern", "social_frame",
    ):
        assert t in COMPONENT_REGISTRY
        assert t in MOTION_GRAPHIC_TYPES


def test_get_component_library_returns_catalog():
    items = get_component_library()
    assert len(items) == len(COMPONENT_REGISTRY)
    assert all("type" in item and "defaults" in item for item in items)


def test_validate_motion_plan_clamps_duration():
    plan = {
        "fps": 30,
        "width": 1080,
        "height": 1920,
        "elements": [
            {
                "id": "t1",
                "type": "animated_title",
                "startSeconds": 0,
                "endSeconds": 100,
                "position": {"xPct": 50, "yPct": 30},
                "animation": {"enter": "word_pop", "exit": "fade"},
                "props": {"text": "Hello"},
            }
        ],
    }
    normalized, warnings = validate_motion_plan(plan, video_duration=10.0)
    el = normalized["elements"][0]
    assert el["endSeconds"] <= 10.0
    assert el["startSeconds"] >= 0
    assert "spring" in el["animation"]
    # animated_title uses elegant_glide (corporate) from Physics Constant Manifest
    assert el["animation"]["spring"]["damping"] == 24


def test_validate_drops_unknown_type():
    plan = {
        "elements": [
            {
                "id": "x",
                "type": "not_a_real_type",
                "startSeconds": 0,
                "endSeconds": 2,
                "position": {"xPct": 50, "yPct": 50},
                "props": {},
            }
        ],
    }
    normalized, warnings = validate_motion_plan(plan, video_duration=5.0)
    assert normalized["elements"] == []
    assert any("Unknown" in w for w in warnings)


def test_validate_normalizes_invalid_color():
    plan = {
        "elements": [
            {
                "id": "c1",
                "type": "cta_badge",
                "startSeconds": 0,
                "endSeconds": 2,
                "position": {"xPct": 50, "yPct": 80},
                "animation": {"enter": "pop_pulse", "exit": "fade"},
                "props": {"text": "Subscribe", "brandColor": "not-a-color"},
            }
        ],
    }
    normalized, _ = validate_motion_plan(plan, video_duration=5.0)
    assert normalized["elements"][0]["props"]["brandColor"] == "#EF4444"


def test_validate_bar_chart_aligns_labels_values():
    plan = {
        "elements": [
            {
                "id": "chart",
                "type": "bar_chart",
                "startSeconds": 1,
                "endSeconds": 5,
                "position": {"xPct": 50, "yPct": 50},
                "animation": {"enter": "grow", "exit": "fade", "spring": {"damping": 12}},
                "props": {
                    "title": "Growth",
                    "labels": ["A", "B", "C", "D"],
                    "values": [10, 20],
                    "brandColor": "#3B82F6",
                },
            }
        ],
    }
    normalized, _ = validate_motion_plan(plan, video_duration=30)
    props = normalized["elements"][0]["props"]
    assert len(props["labels"]) == len(props["values"]) == 2
    assert normalized["elements"][0]["animation"]["spring"]["damping"] == 12


def test_plan_from_timeline_clips_maps_overlay():
    clips = [
        {
            "id": "clip-1",
            "timeline_start": 1.0,
            "timeline_end": 4.0,
            "effects": [
                {
                    "type": "visual_overlay",
                    "params": {
                        "visual_type": "animated_title",
                        "display_value": "Hook title",
                        "x_pct": 50,
                        "y_pct": 28,
                        "motion_enter": "word_pop",
                        "motion_exit": "fade",
                    },
                }
            ],
        },
        {
            "id": "clip-2",
            "timeline_start": 0,
            "timeline_end": 2,
            "effects": [
                {
                    "type": "visual_overlay",
                    "params": {"visual_type": "data_card", "display_value": "99"},
                }
            ],
        },
        {
            "id": "clip-3",
            "timeline_start": 5.0,
            "timeline_end": 9.0,
            "effects": [
                {
                    "type": "visual_overlay",
                    "params": {
                        "visual_type": "bar_chart",
                        "motion_props": {
                            "title": "Revenue",
                            "labels": ["Q1", "Q2"],
                            "values": [30, 60],
                        },
                        "motion_animation": {
                            "enter": "grow",
                            "exit": "fade",
                            "spring": {"damping": 10, "stiffness": 200, "mass": 1},
                        },
                    },
                }
            ],
        },
    ]
    plan = plan_from_timeline_clips(clips, video_duration=30, width=1080, height=1920)
    assert len(plan["elements"]) == 2
    assert plan["elements"][0]["type"] == "animated_title"
    assert plan["elements"][0]["props"]["text"] == "Hook title"
    assert plan["elements"][1]["type"] == "bar_chart"
    assert plan["elements"][1]["props"]["labels"] == ["Q1", "Q2"]
    assert plan["elements"][1]["animation"]["spring"]["damping"] == 10


def test_motion_graphic_types_frozen():
    assert "kinetic_text" in MOTION_GRAPHIC_TYPES
    assert "bar_chart" in MOTION_GRAPHIC_TYPES
    assert "data_card" not in MOTION_GRAPHIC_TYPES


def test_prepare_motion_assets_extracts_numbers():
    segments = [
        {"text": "Revenue grew 42% last year to $1.2M.", "start": 2.0, "end": 5.0},
        {"text": "This is a memorable quote about growth.", "start": 6.0, "end": 8.0},
        {"text": "We expanded to Kathmandu and Pokhara.", "start": 9.0, "end": 11.0},
    ]
    assets = prepare_motion_assets(segments, brand_color="#C41E3A")
    assert assets["brandColor"] == "#C41E3A"
    assert len(assets["numbers"]) >= 1
    assert len(assets["percentages"]) >= 1
    assert assets["locations"]
    assert assets["suggestedCharts"]
    assert any(c["type"] == "comparison_chart" for c in assets["suggestedCharts"])


def test_detect_content_type_from_keywords():
    assert detect_content_type(
        [{"text": "Our consultancy strategy improved ROI", "start": 0, "end": 2}]
    ) == "consultancy"
    assert detect_content_type(
        [{"text": "Welcome to this podcast episode", "start": 0, "end": 2}]
    ) == "podcast"


def test_magic_presets_defined():
    for pid in (
        "auto", "podcast", "interview", "social_reel", "social",
        "consultancy", "pitch", "product", "launch", "demo",
        "explainer", "minimal",
    ):
        assert pid in MAGIC_PRESETS
        assert MAGIC_PRESETS[pid].get("one_tap") is True
        assert "package" in MAGIC_PRESETS[pid]
    assert MAGIC_PRESETS["interview"]["package"] == "podcast"
    assert MAGIC_PRESETS["social_reel"]["package"] == "social"
    assert MAGIC_PRESETS["pitch"]["package"] == "consultancy"
    assert MAGIC_PRESETS["launch"]["package"] == "product"
    assert MAGIC_PRESETS["minimal"]["density"] == "sparse"
    assert "active_speaker_split" in MAGIC_PRESETS["podcast"]["preferred"]
    assert "device_mockup" in MAGIC_PRESETS["product"]["preferred"]
    assert MAGIC_PRESETS["podcast"].get("atomic_preset") == "podcast"
    assert MAGIC_PRESETS["social"].get("atomic_preset") == "social"


def test_build_atomic_preset_plan_podcast():
    plan = build_atomic_preset_plan("podcast", video_duration=10.0, brand_color="#3B82F6")
    types = {el["type"] for el in plan["elements"]}
    assert "active_speaker_split" in types
    assert "symmetric_audio_strip" in types
    assert plan["width"] == 1920
    assert plan["height"] == 1080
    spring = plan["elements"][0]["animation"]["spring"]
    assert spring["damping"] == SPRING_PROFILES["corporate"]["damping"]


def test_build_atomic_preset_plan_social_forces_snappy():
    plan = build_atomic_preset_plan("social", video_duration=8.0)
    assert plan["width"] == 1080
    assert plan["height"] == 1920
    spring = plan["elements"][0]["animation"]["spring"]
    assert spring == SPRING_PROFILES["social"]


def test_apply_preset_layout_forces_package_curve():
    plan = {
        "elements": [
            {
                "id": "1",
                "type": "kinetic_karaoke",
                "position": {"xPct": 50, "yPct": 50},
                "animation": {},
                "props": {},
            },
        ]
    }
    out = apply_preset_layout(plan, "social")
    assert out["elements"][0]["animation"]["spring"] == SPRING_PROFILES["social"]
    assert out["elements"][0]["position"]["yPct"] == 72


def test_blueprint_springs_differ_by_family():
    social = spring_for_type("karaoke_caption")
    corporate = spring_for_type("line_chart")
    product = spring_for_type("device_mockup")
    assert social == {"mass": 0.4, "damping": 12, "stiffness": 180}
    assert corporate == {"mass": 1.0, "damping": 24, "stiffness": 90}
    assert product == {"mass": 0.7, "damping": 8, "stiffness": 140}
    assert social["damping"] == SPRING_PROFILES["social"]["damping"]
    assert corporate["damping"] == SPRING_PROFILES["corporate"]["damping"]
    assert product["mass"] == SPRING_PROFILES["product"]["mass"]
    assert social["damping"] != corporate["damping"]


def test_apply_preset_layout_snaps_podcast_positions():
    plan = {
        "elements": [
            {
                "id": "1",
                "type": "eq_visualizer",
                "position": {"xPct": 50, "yPct": 50},
                "animation": {},
                "props": {},
            },
            {
                "id": "2",
                "type": "broadcast_lower_third",
                "position": {"xPct": 50, "yPct": 50},
                "animation": {},
                "props": {},
            },
        ]
    }
    out = apply_preset_layout(plan, "podcast")
    assert out["elements"][0]["position"]["yPct"] == 90
    assert out["elements"][1]["position"]["yPct"] == 86
    # eq_visualizer uses elegant_glide (corporate)
    assert out["elements"][0]["animation"]["spring"]["damping"] == 24


def test_thin_llm_plan_replaced_by_fallback():
    with patch(
        "services.motion_graphics_service._call_director_llm",
        return_value={"elements": [{"type": "animated_title", "startSeconds": 0, "endSeconds": 2, "props": {}}]},
    ):
        plan, _, _ = direct_motion_plan(
            [{"text": "Welcome to the podcast episode.", "start": 0, "end": 2}],
            video_duration=30.0,
            preset="podcast",
            brand_color="#3B82F6",
        )
    # Atomic preset injects pillar nodes (active speaker, EQ, lower third, …)
    assert len(plan["elements"]) >= 4
    types = {el["type"] for el in plan["elements"]}
    assert "active_speaker_split" in types


def test_direct_motion_plan_fallback_when_llm_empty():
    segments = [
        {"text": "We hit 100 customers in Nepal.", "start": 1.0, "end": 3.0},
    ]
    with patch(
        "services.motion_graphics_service._call_director_llm",
        return_value={"elements": []},
    ):
        plan, warnings, assets = direct_motion_plan(
            segments,
            video_duration=20.0,
            user_prompt="Make professional consultancy video with animated charts",
            brand_color="#3B82F6",
            style="vox",
            density="rich",
            preset="explainer",
        )
    assert plan["elements"]
    types = {el["type"] for el in plan["elements"]}
    assert "animated_title" in types
    assert "halftone" in types or "accent_stroke" in types
    assert assets["numbers"] or assets["suggestedCharts"]


def test_podcast_fallback_uses_podcast_components():
    with patch(
        "services.motion_graphics_service._call_director_llm",
        return_value={"elements": []},
    ):
        plan, _, _ = direct_motion_plan(
            [{"text": "Welcome to the podcast episode with our guest.", "start": 0, "end": 3}],
            video_duration=30.0,
            preset="podcast",
            brand_color="#3B82F6",
        )
    types = {el["type"] for el in plan["elements"]}
    assert "active_speaker_split" in types
    assert "symmetric_audio_strip" in types or "circular_orbit_equalizer" in types


def test_product_fallback_uses_product_components():
    with patch(
        "services.motion_graphics_service._call_director_llm",
        return_value={"elements": []},
    ):
        plan, _, _ = direct_motion_plan(
            [{"text": "Launching our new product today.", "start": 0, "end": 2}],
            video_duration=30.0,
            preset="product",
            brand_color="#3B82F6",
        )
    types = {el["type"] for el in plan["elements"]}
    assert "device_mockup" in types
    assert "dynamic_feature_callout" in types


def test_suggest_delegates_to_director_for_vox_style():
    with patch(
        "services.motion_graphics_service.direct_motion_plan",
        return_value=({"elements": [{"type": "animated_title"}]}, [], {}),
    ) as mock_dir:
        plan, warnings = suggest_motion_placements(
            [],
            video_duration=10.0,
            user_prompt="VOX style charts",
            style="vox",
        )
    mock_dir.assert_called_once()
    assert plan["elements"]
