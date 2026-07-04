"""
ViraEdit — Motion graphics router (Code-as-Video).

GET  /api/v1/motion-graphics/library   — component catalog
POST /api/v1/motion-graphics/validate  — validate + normalize a motion plan
POST /api/v1/motion-graphics/suggest   — AI placement suggestions
POST /api/v1/motion-graphics/magic     — Magic VOX Mode (AI Director)
POST /api/v1/motion-graphics/prepare   — asset preparation from transcript
GET  /api/v1/motion-graphics/health    — Remotion service reachability
"""
from __future__ import annotations

from typing import Any, Optional

import structlog
from fastapi import APIRouter
from pydantic import BaseModel, Field

from processors.remotion_client import remotion_service_healthy
from services.motion_graphics_service import (
    MAGIC_PRESETS,
    direct_motion_plan,
    get_component_library,
    prepare_motion_assets,
    suggest_motion_placements,
    validate_motion_plan,
)

router = APIRouter(prefix="/api/v1/motion-graphics", tags=["motion-graphics"])
log = structlog.get_logger("viraedit.motion_graphics")


class ValidateRequest(BaseModel):
    plan: dict[str, Any]
    video_duration: Optional[float] = Field(None, ge=0)


class SuggestRequest(BaseModel):
    transcript_segments: list[dict[str, Any]] = Field(default_factory=list)
    video_duration: float = Field(..., ge=0)
    content_type: str = "podcast"
    brand_color: str = "#3B82F6"
    max_elements: int = Field(8, ge=1, le=16)
    user_prompt: str = ""
    style: str = "default"


class MagicRequest(BaseModel):
    """Magic VOX Mode — natural language director brief."""

    prompt: str = Field(
        default="",
        max_length=2000,
        description="Natural language brief, e.g. 'Make professional consultancy video with animated charts'",
    )
    transcript_segments: list[dict[str, Any]] = Field(default_factory=list)
    video_duration: float = Field(..., ge=0.5)
    content_type: str = "auto"
    brand_color: str = "#3B82F6"
    max_elements: int = Field(12, ge=1, le=18)
    width: int = Field(1080, ge=320, le=3840)
    height: int = Field(1920, ge=320, le=3840)
    fps: int = Field(30, ge=12, le=60)
    style: str = "vox"
    density: str = Field("balanced", description="sparse | balanced | rich")
    preset: str = Field("", description="consultancy | explainer | podcast | product")


class PrepareRequest(BaseModel):
    transcript_segments: list[dict[str, Any]] = Field(default_factory=list)
    brand_color: str = "#3B82F6"


@router.get("/library")
async def motion_graphics_library() -> dict[str, Any]:
    """Return the motion graphics component catalog."""
    return {"components": get_component_library()}


@router.get("/presets")
async def motion_graphics_presets() -> dict[str, Any]:
    """Return Magic Mode presets for non-editors (one-tap packages)."""
    return {
        "presets": [
            {
                "id": pid,
                "label": cfg["label"],
                "hint": cfg.get("hint", ""),
                "prompt": cfg["prompt"],
                "density": cfg.get("density", "balanced"),
                "max_elements": cfg.get("max_elements", 12),
                "package": cfg.get("package", pid),
                "preferred": cfg.get("preferred", []),
                "one_tap": cfg.get("one_tap", True),
            }
            for pid, cfg in MAGIC_PRESETS.items()
        ]
    }


@router.post("/validate")
async def validate_plan(body: ValidateRequest) -> dict[str, Any]:
    """Validate and normalize a motion plan JSON."""
    plan, warnings = validate_motion_plan(body.plan, video_duration=body.video_duration)
    return {"plan": plan, "warnings": warnings}


@router.post("/suggest")
async def suggest_placements(body: SuggestRequest) -> dict[str, Any]:
    """AI-suggest motion graphic placements from transcript segments."""
    plan, warnings = suggest_motion_placements(
        body.transcript_segments,
        video_duration=body.video_duration,
        content_type=body.content_type,
        brand_color=body.brand_color,
        max_elements=body.max_elements,
        user_prompt=body.user_prompt,
        style=body.style,
    )
    return {"plan": plan, "warnings": warnings}


@router.post("/magic")
async def magic_vox_mode(body: MagicRequest) -> dict[str, Any]:
    """
    Magic VOX Mode — AI Director writes a full Motion Plan from a natural-language prompt.

    Pipeline: prompt + transcript → asset prep → LLM Director → validated plan.
    Client applies the plan to the timeline; export renders via Remotion + FFmpeg.
    """
    prompt = body.prompt.strip()
    preset = (body.preset or "").strip().lower()
    if not prompt and not preset:
        # Default to explainer preset for one-tap Magic Mode
        preset = "explainer"
        prompt = MAGIC_PRESETS["explainer"]["prompt"]

    density = body.density if body.density in ("sparse", "balanced", "rich") else "balanced"

    log.info(
        "magic_vox_requested",
        prompt_len=len(prompt),
        duration=body.video_duration,
        segments=len(body.transcript_segments),
        preset=preset or None,
        density=density,
    )

    plan, warnings, assets = direct_motion_plan(
        body.transcript_segments,
        video_duration=body.video_duration,
        user_prompt=prompt,
        content_type=body.content_type,
        brand_color=body.brand_color,
        max_elements=body.max_elements,
        style=body.style or "vox",
        density=density,
        preset=preset,
        width=body.width,
        height=body.height,
        fps=body.fps,
    )

    return {
        "plan": plan,
        "warnings": warnings,
        "assets": {
            "numbers": assets.get("numbers", []),
            "quotes": assets.get("quotes", []),
            "locations": assets.get("locations", []),
            "suggestedCharts": assets.get("suggestedCharts", []),
            "detectedContentType": assets.get("detectedContentType"),
            "hookText": assets.get("hookText"),
        },
        "style": body.style or "vox",
        "density": density,
        "preset": preset or None,
        "summary": {
            "elementCount": len(plan.get("elements") or []),
            "types": sorted({el.get("type") for el in (plan.get("elements") or [])}),
        },
    }


@router.post("/prepare")
async def prepare_assets(body: PrepareRequest) -> dict[str, Any]:
    """Extract structured assets (numbers, quotes, chart series) from transcript."""
    assets = prepare_motion_assets(
        body.transcript_segments,
        brand_color=body.brand_color,
    )
    return {"assets": assets}


@router.get("/health")
async def motion_graphics_health() -> dict[str, Any]:
    """Check Remotion render service reachability for the motion pipeline."""
    ok = await remotion_service_healthy()
    return {"remotion_ok": ok, "motion_graphics_ready": ok}
