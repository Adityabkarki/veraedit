"""
ViraEdit — Motion graphics router.

GET  /api/v1/motion-graphics/library   — component catalog
POST /api/v1/motion-graphics/validate  — validate + normalize a motion plan
POST /api/v1/motion-graphics/suggest   — AI placement suggestions
GET  /api/v1/motion-graphics/health    — Remotion service reachability
"""
from __future__ import annotations

from typing import Any, Optional

import structlog
from fastapi import APIRouter
from pydantic import BaseModel, Field

from processors.remotion_client import remotion_service_healthy
from services.motion_graphics_service import (
    get_component_library,
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
    max_elements: int = Field(8, ge=1, le=12)


@router.get("/library")
async def motion_graphics_library() -> dict[str, Any]:
    """Return the motion graphics component catalog."""
    return {"components": get_component_library()}


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
    )
    return {"plan": plan, "warnings": warnings}


@router.get("/health")
async def motion_graphics_health() -> dict[str, Any]:
    """Check Remotion render service reachability for the motion pipeline."""
    ok = await remotion_service_healthy()
    return {"remotion_ok": ok, "motion_graphics_ready": ok}
