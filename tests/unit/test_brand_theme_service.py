"""Unit tests for brand_kit → ThemeToken resolution."""
from __future__ import annotations

from services.brand_theme_service import attach_theme_to_plan, brand_kit_to_theme


def test_brand_kit_to_theme_canonical_colors():
    theme = brand_kit_to_theme(
        {
            "primary_color": "#C41E3A",
            "secondary_color": "#111113",
            "accent_color": "#F59E0B",
            "font_style": "nepali",
            "logo_text": "ViraEdit",
        }
    )
    assert theme["schemaVersion"] == 1
    assert theme["colors"]["primary"] == "#C41E3A"
    assert theme["colors"]["accent"] == "#F59E0B"
    assert theme["identity"]["brandName"] == "ViraEdit"
    assert theme["typography"]["headingFont"] == "Montserrat"


def test_attach_theme_to_plan_from_brand_kit():
    plan = {"version": 1, "fps": 30, "width": 1920, "height": 1080, "elements": []}
    out = attach_theme_to_plan(
        plan,
        brand_kit={
            "primaryColor": "#2563EB",
            "secondaryColor": "#F1F5F9",
            "accentColor": "#E11D48",
            "fontStyle": "default",
            "logoText": "Light Co",
        },
    )
    assert "theme" in out
    assert out["theme"]["colors"]["background"] == "#F1F5F9"
    assert out["theme"]["glass"]["surfaceOpacity"] > 0.4
