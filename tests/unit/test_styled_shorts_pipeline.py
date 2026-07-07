"""Tests for Director-styled shorts pipeline helpers (Phase 11)."""
from __future__ import annotations

from processors.remotion_client import (
    PLATFORM_RENDER_VARIANTS,
    platform_to_render_variant_key,
)
from services.director.styled_shorts_pipeline import platforms_from_scores


def test_platforms_from_scores_ranks_by_score():
    scores = {
        "youtube": 8.2,
        "tiktok": 9.1,
        "instagram": 7.8,
        "linkedin": 4.0,
        "intent": "other",
    }
    platforms = platforms_from_scores(scores)
    assert platforms[0] == "tiktok"
    assert "youtube_shorts" in platforms
    assert "linkedin" not in platforms


def test_platforms_from_scores_defaults_when_empty():
    assert platforms_from_scores(None)
    assert platforms_from_scores({}) == ["tiktok", "instagram_reels", "youtube_shorts"]


def test_platform_to_render_variant_key():
    assert platform_to_render_variant_key("instagram_reels") == "instagram"
    assert PLATFORM_RENDER_VARIANTS["linkedin"]["showCtaBadge"] is False


def test_build_prepare_payload_includes_ml_hook():
    from services.director.styled_shorts_pipeline import (
        StyledShortContext,
        build_prepare_payload,
    )

    ctx = StyledShortContext(
        project_id="p1",
        theme={"schemaVersion": 1},
        parent_timeline=None,
        signals={"durationSeconds": 30},
        primary_asset_id="a1",
    )
    payload = build_prepare_payload(
        ctx,
        start_time=5.0,
        end_time=35.0,
        hook="Best moment",
        viral_score=8.5,
        base_only=True,
    )
    assert payload["baseOnly"] is True
    assert payload["hookPhrase"]["confidenceSource"] == "ml"
    assert payload["hookPhrase"]["confidence"] == 0.85
