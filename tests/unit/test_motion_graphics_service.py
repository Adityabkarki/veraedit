"""Unit tests for motion_graphics_service."""
from __future__ import annotations

import pytest

from services.motion_graphics_service import (
    COMPONENT_REGISTRY,
    MOTION_GRAPHIC_TYPES,
    get_component_library,
    plan_from_timeline_clips,
    validate_motion_plan,
)


def test_component_registry_has_twelve_types():
    assert len(COMPONENT_REGISTRY) >= 12
    assert "animated_title" in COMPONENT_REGISTRY
    assert "end_card" in COMPONENT_REGISTRY


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
    ]
    plan = plan_from_timeline_clips(clips, video_duration=30, width=1080, height=1920)
    assert len(plan["elements"]) == 1
    el = plan["elements"][0]
    assert el["type"] == "animated_title"
    assert el["props"]["text"] == "Hook title"
    assert el["startSeconds"] == 1.0


def test_motion_graphic_types_frozen():
    assert "kinetic_text" in MOTION_GRAPHIC_TYPES
    assert "data_card" not in MOTION_GRAPHIC_TYPES
