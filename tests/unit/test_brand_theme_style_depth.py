"""Tests for style depth on ThemeToken resolution."""
from __future__ import annotations

from services.brand_theme_service import (
    apply_style_dna_to_theme,
    brand_kit_to_theme,
    validate_style_depth,
)


def test_apply_style_dna_sets_grade_motion_and_mood():
    base = brand_kit_to_theme({"primaryColor": "#112233"})
    themed = apply_style_dna_to_theme(base, {"visual_style": "bold", "pacing": "fast"})
    assert themed["motion"]["defaultCurve"] == "snappy_spring"
    assert themed["grade"]["contrast"] >= 0.15
    assert themed["meta"]["brollMoodKeywords"] == ["bold", "vibrant", "dynamic"]


def test_validate_style_depth_flags_missing_fields():
    theme = brand_kit_to_theme({})
    depth = validate_style_depth(theme)
    assert depth["ok"] is True

    shallow = {"motion": {}, "grade": {}, "meta": {"source": "cloned"}}
    depth = validate_style_depth(shallow)
    assert depth["ok"] is False
    assert "motion.defaultCurve" in depth["missing"]
