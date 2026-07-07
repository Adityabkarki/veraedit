"""Tests for Director-styled Short/Sizzle helpers (Phase 11)."""
from __future__ import annotations

from processors.remotion_client import (
    PLATFORM_RENDER_VARIANTS,
    platform_to_render_variant_key,
)


def test_platform_to_render_variant_key_tiktok():
    assert platform_to_render_variant_key("tiktok") == "tiktok"
    assert platform_to_render_variant_key("youtube_shorts") == "youtube"


def test_platform_to_render_variant_key_linkedin():
    assert platform_to_render_variant_key("linkedin") == "linkedin"
    variant = PLATFORM_RENDER_VARIANTS["linkedin"]
    assert variant["showCtaBadge"] is False
    assert variant["captionDensity"] == "reduced"


def test_platform_render_variants_tiktok_has_cta():
    variant = PLATFORM_RENDER_VARIANTS["tiktok"]
    assert variant["showCtaBadge"] is True
    assert variant["captionDensity"] == "full_karaoke"
