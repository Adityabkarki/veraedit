"""Platform render variant schema — Phase 11 Phase 4."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class PlatformRenderVariantSchema(BaseModel):
    """Render-time variation from one compiled DirectorTimeline (Platform Variant Law)."""

    platform: Literal["youtube", "instagram", "tiktok", "linkedin"]
    show_cta_badge: bool = Field(alias="showCtaBadge")
    caption_density: Literal["full_karaoke", "reduced"] = Field(alias="captionDensity")
    end_card_style: Literal["follow_prompt", "none"] = Field(alias="endCardStyle")

    model_config = {"populate_by_name": True}


def render_variants_from_platform_scores(platform_scores: dict | None) -> list[str]:
    """Platforms scoring >= MIN from shorts.platform_scores JSONB."""
    from services.director.styled_shorts_pipeline import platforms_from_scores

    return platforms_from_scores(platform_scores)
