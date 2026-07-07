"""
Brand Kit → ThemeToken resolution for motion plans.

Mirrors remotion-service/src/lib/theme/brandKitToTheme.ts.
Runs once upstream — never during Remotion render.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any


_HEX_RE = re.compile(r"^#([0-9A-Fa-f]{6})$")


def _normalize_hex(raw: str | None, fallback: str) -> str:
    if not raw:
        return fallback.upper()
    value = raw.strip()
    if not value.startswith("#"):
        value = f"#{value}"
    if _HEX_RE.match(value):
        return value.upper()
    if len(value) == 4:
        c = value[1:]
        value = f"#{c[0]}{c[0]}{c[1]}{c[1]}{c[2]}{c[2]}"
        if _HEX_RE.match(value):
            return value.upper()
    return fallback.upper()


def _relative_luminance(hex_color: str) -> float:
    r, g, b = (int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5))

    def channel(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    rs, gs, bs = channel(r), channel(g), channel(b)
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs


def _contrast_ratio(a: str, b: str) -> float:
    l1, l2 = _relative_luminance(a), _relative_luminance(b)
    lighter, darker = max(l1, l2), min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def _contrast_text(background: str) -> str:
    white, black = "#F8FAFC", "#0F172A"
    if _contrast_ratio(white, background) >= 4.5:
        return white
    if _contrast_ratio(black, background) >= 4.5:
        return black
    return white if _relative_luminance(background) < 0.5 else black


def _font_pairing(font_style: str | None) -> tuple[str, str]:
    if font_style == "nepali":
        return "Montserrat", "Open Sans"
    return "Inter", "Inter"


def brand_kit_to_theme(kit: dict[str, Any]) -> dict[str, Any]:
    """Resolve editor Brand Kit dict to a ThemeToken-shaped JSON object."""
    primary = _normalize_hex(
        kit.get("primary_color") or kit.get("primaryColor"), "#C41E3A"
    )
    secondary = _normalize_hex(
        kit.get("secondary_color") or kit.get("secondaryColor"), "#111113"
    )
    accent = _normalize_hex(
        kit.get("accent_color") or kit.get("accentColor"), "#F59E0B"
    )
    background = secondary
    surface = secondary
    font_style = str(kit.get("font_style") or kit.get("fontStyle") or "nepali")
    heading_font, body_font = _font_pairing(font_style)
    brand_name = str(kit.get("logo_text") or kit.get("logoText") or "ViraEdit").strip() or "ViraEdit"
    logo_url = kit.get("logo_url") or kit.get("logoUrl")

    is_light = _relative_luminance(surface) > 0.5
    glass = {
        "surfaceOpacity": 0.55 if is_light else 0.1,
        "borderOpacity": 0.35 if is_light else 0.2,
        "blurStrength": "lg" if is_light else "md",
    }

    theme: dict[str, Any] = {
        "schemaVersion": 1,
        "identity": {
            "brandName": brand_name,
            **({"logoUrl": logo_url} if logo_url else {}),
        },
        "colors": {
            "primary": primary,
            "secondary": secondary,
            "accent": accent,
            "background": background,
            "surface": surface,
            "onPrimary": _contrast_text(primary),
            "onSurface": _contrast_text(surface),
            "onBackground": _contrast_text(background),
        },
        "typography": {
            "headingFont": heading_font,
            "bodyFont": body_font,
            "devanagariFont": "Noto Sans Devanagari",
            "weightScale": {"heading": 700, "body": 400},
        },
        "motion": {"defaultCurve": "elegant_glide"},
        "glass": glass,
        "grade": {
            "contrast": 0.05,
            "saturation": -0.1,
            "warmth": -0.05,
            "vignetteIntensity": 0.0,
            "grainIntensity": 0.0,
            "blendMode": "normal",
        },
        "meta": {
            "source": "manual",
            "resolvedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        },
    }
    return theme


VISUAL_STYLE_MOOD: dict[str, list[str]] = {
    "corporate": ["corporate", "professional", "office"],
    "minimalist": ["minimal", "clean", "simple"],
    "bold": ["bold", "vibrant", "dynamic"],
    "cinematic": ["cinematic", "dramatic", "film"],
    "ugc": ["authentic", "casual", "natural"],
}

VISUAL_STYLE_GRADE: dict[str, dict[str, float]] = {
    "corporate": {"contrast": 0.08, "saturation": -0.05, "warmth": -0.02, "grainIntensity": 0.0},
    "minimalist": {"contrast": 0.03, "saturation": -0.15, "warmth": 0.0, "grainIntensity": 0.0},
    "bold": {"contrast": 0.18, "saturation": 0.12, "warmth": 0.05, "grainIntensity": 0.02},
    "cinematic": {"contrast": 0.12, "saturation": 0.05, "warmth": 0.08, "vignetteIntensity": 0.12},
    "ugc": {"contrast": 0.06, "saturation": 0.0, "warmth": 0.04, "grainIntensity": 0.04},
}

PACING_TO_CURVE: dict[str, str] = {
    "fast": "snappy_spring",
    "slow": "elegant_glide",
    "medium": "elegant_glide",
    "aggressive": "snappy_spring",
    "relaxed": "elegant_glide",
}


def apply_style_dna_to_theme(theme: dict[str, Any], style_dna: dict[str, Any]) -> dict[str, Any]:
    """
    Extend a ThemeToken with grade, motion personality, and B-roll mood from cloned style.
    """
    next_theme = dict(theme)
    visual_style = str(style_dna.get("visual_style") or style_dna.get("visualStyle") or "").lower()
    pacing = str(style_dna.get("pacing") or style_dna.get("cut_pacing") or "").lower()

    grade = dict(next_theme.get("grade") or {})
    if visual_style in VISUAL_STYLE_GRADE:
        grade.update(VISUAL_STYLE_GRADE[visual_style])
    next_theme["grade"] = grade

    motion = dict(next_theme.get("motion") or {})
    if pacing in PACING_TO_CURVE:
        motion["defaultCurve"] = PACING_TO_CURVE[pacing]
    elif visual_style == "bold":
        motion["defaultCurve"] = "snappy_spring"
    next_theme["motion"] = motion

    meta = dict(next_theme.get("meta") or {})
    meta["source"] = "cloned"
    if visual_style:
        meta["visualStyle"] = visual_style
        meta["brollMoodKeywords"] = VISUAL_STYLE_MOOD.get(visual_style, [])
    next_theme["meta"] = meta
    return next_theme


def validate_style_depth(theme: dict[str, Any]) -> dict[str, Any]:
    """Confirm themeable fields were populated — not silently DEFAULT-only."""
    missing: list[str] = []
    motion = theme.get("motion") or {}
    grade = theme.get("grade") or {}
    meta = theme.get("meta") or {}

    if not motion.get("defaultCurve"):
        missing.append("motion.defaultCurve")
    if grade.get("contrast") is None:
        missing.append("grade.contrast")
    if meta.get("source") == "cloned" and not meta.get("brollMoodKeywords"):
        missing.append("meta.brollMoodKeywords")

    return {"ok": len(missing) == 0, "missing": missing}


_TEXT_STYLE_TO_VISUAL: dict[str, str] = {
    "minimal": "minimalist",
    "bold": "bold",
    "neon": "bold",
    "corporate": "corporate",
}


def project_style_dna_from_extracted(dna: dict[str, Any] | Any) -> dict[str, Any]:
    """
    Map StyleDNA (or dict) to project.settings.style_dna for Director compile theming.
    """
    if dna is None:
        return {}

    if hasattr(dna, "to_dict"):
        raw = dna.to_dict()
    elif isinstance(dna, dict):
        raw = dna
    else:
        return {}

    visuals = raw.get("visuals") or {}
    pacing = raw.get("pacing") or {}
    color = raw.get("color") or {}

    text_style = str(visuals.get("text_style") or visuals.get("textStyle") or "minimal").lower()
    visual_style = _TEXT_STYLE_TO_VISUAL.get(text_style, "ugc")

    cpm = float(pacing.get("cuts_per_minute") or pacing.get("cutsPerMinute") or 20.0)
    if cpm >= 28:
        pacing_label = "fast"
    elif cpm <= 14:
        pacing_label = "slow"
    else:
        pacing_label = "medium"

    return {
        "visual_style": visual_style,
        "pacing": pacing_label,
        "cuts_per_minute": cpm,
        "color_contrast": float(color.get("contrast") or 0),
        "color_saturation": float(color.get("saturation") or 0),
        "color_temperature": float(color.get("temperature") or 0),
        "source_preset": raw.get("source_title") or raw.get("sourceTitle") or "",
    }


def attach_theme_to_plan(
    plan: dict[str, Any],
    *,
    brand_kit: dict[str, Any] | None = None,
    brand_color: str | None = None,
    accent_color: str | None = None,
) -> dict[str, Any]:
    """Attach resolved theme to a motion plan from Brand Kit or legacy colors."""
    if brand_kit:
        plan["theme"] = brand_kit_to_theme(brand_kit)
        return plan

    if brand_color or accent_color:
        kit = {
            "primaryColor": brand_color or "#C41E3A",
            "secondaryColor": "#111113",
            "accentColor": accent_color or "#F59E0B",
            "fontStyle": "nepali",
            "logoText": "ViraEdit",
        }
        plan["theme"] = brand_kit_to_theme(kit)
    return plan
