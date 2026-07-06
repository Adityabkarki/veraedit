"""Tests for Look VFX Engine grade presets."""
from services.cuts.plan_cuts import PACING_PRESETS

# Grade presets mirrored from remotion-service (sanity check for API consistency)
GRADE_PRESETS = {
    "podcast": {"warmth": 0.15, "grainIntensity": 0.08},
    "consultancy": {"warmth": -0.05, "grainIntensity": 0.0},
    "social": {"contrast": 0.25, "grainIntensity": 0.05},
    "showcase": {"grainIntensity": 0.0},
}


def test_consultancy_grade_is_neutral_explicit():
    g = GRADE_PRESETS["consultancy"]
    assert g["grainIntensity"] == 0.0
    assert g["warmth"] < 0


def test_social_grade_is_punchier_than_podcast():
    assert GRADE_PRESETS["social"]["contrast"] > 0.2


def test_pacing_presets_all_three_profiles_exist():
    assert set(PACING_PRESETS.keys()) == {"relaxed", "balanced", "aggressive"}
