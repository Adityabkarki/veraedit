"""Style apply persists style_dna on project settings for Director theming."""
from __future__ import annotations

from services.brand_theme_service import project_style_dna_from_extracted
from tasks.style_transfer.models import PacingProfile, StyleDNA, VisualProfile


def test_project_style_dna_from_extracted_maps_visual_and_pacing():
    dna = StyleDNA(
        visuals=VisualProfile(text_style="corporate"),
        pacing=PacingProfile(cuts_per_minute=32.0),
    )
    out = project_style_dna_from_extracted(dna)
    assert out["visual_style"] == "corporate"
    assert out["pacing"] == "fast"


def test_project_style_dna_from_dict():
    out = project_style_dna_from_extracted(
        {"visuals": {"text_style": "bold"}, "pacing": {"cuts_per_minute": 10}}
    )
    assert out["visual_style"] == "bold"
    assert out["pacing"] == "slow"
