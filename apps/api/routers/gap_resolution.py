"""
ViraEdit — Asset gap resolution router (Phase 02).

POST /api/v1/gap-resolution/match         — annotate template slots with match status
POST /api/v1/gap-resolution/generate-slot — generate missing slot asset
"""
from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter
from sqlalchemy import select

from dependencies import CurrentUser, DbDep, StorageDep
from models import Brand, LibraryAsset, User
from processors.asset_matcher import match_template_to_library
from processors.gap_generator import (
    _IMAGE_GEN_COST_USD,
    generate_missing_image,
    generate_missing_video_concept,
)
from services.ai_budget import budget
from schemas.gap_resolution import GenerateSlotRequest, GenerateSlotResponse, MatchTemplateRequest
from storage import make_library_storage_key

router = APIRouter(prefix="/api/v1/gap-resolution", tags=["gap-resolution"])
log = structlog.get_logger("viraedit.gap_resolution")


async def _brand_context_for_user(user_id: uuid.UUID, db) -> dict:
    result = await db.execute(
        select(Brand).where(Brand.user_id == user_id).limit(1)
    )
    brand = result.scalar_one_or_none()
    if brand is None:
        return {"colors": [], "visual_style": "professional"}
    colors = brand.colors or {}
    return {
        "colors": list(colors.values()) if isinstance(colors, dict) else colors,
        "visual_style": (brand.style_dna or {}).get("visual_style", "professional"),
    }


def _generated_tags(
    description: str,
    *,
    aspect_ratio: str,
    asset_type: str,
    duration_seconds: float | None = None,
) -> dict:
    return {
        "shot_type": "b_roll" if asset_type == "video" else "unknown",
        "subject_count": 0,
        "has_face": False,
        "setting": "unknown",
        "energy_level": "moderate",
        "emotion": "neutral",
        "dominant_colors": [],
        "aspect_ratio": aspect_ratio,
        "is_landscape_orientation": aspect_ratio in ("16:9", "4:3", "21:9"),
        "has_text_overlay": False,
        "has_spoken_audio": False,
        "duration_seconds": duration_seconds,
        "description": description,
        "tagging_confidence": 1.0,
        "is_generated_standin": True,
    }


@router.post("/match")
async def match_template(
    req: MatchTemplateRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """Run matching and return template with per-slot match status."""
    user: User = current_user  # type: ignore[assignment]
    result = await db.execute(
        select(LibraryAsset).where(LibraryAsset.user_id == user.id)
    )
    library = [
        {
            "id": str(asset.id),
            "asset_type": asset.asset_type,
            "tags": asset.tags,
            "storage_key": asset.storage_key,
        }
        for asset in result.scalars().all()
    ]
    annotated = await match_template_to_library(req.template, library)
    log.info(
        "template_matched",
        user_id=str(user.id),
        slots=len(annotated.get("slots", [])),
    )
    return annotated


@router.post("/generate-slot", response_model=GenerateSlotResponse)
async def generate_slot(
    req: GenerateSlotRequest,
    db: DbDep,
    current_user: CurrentUser,
    storage: StorageDep,
) -> GenerateSlotResponse:
    """Generate a missing asset for one template slot."""
    user: User = current_user  # type: ignore[assignment]
    brand_context = await _brand_context_for_user(user.id, db)

    if req.slot_type == "image_placeholder":
        image_bytes = await generate_missing_image(
            req.requirement_description,
            brand_context,
            req.aspect_ratio,
        )
        budget.record(
            _IMAGE_GEN_COST_USD,
            action="image_gen",
            workspace_id=str(user.id),
            provider="gemini",
        )
        asset_id = uuid.uuid4()
        storage_key = make_library_storage_key(str(user.id), str(asset_id), "generated.png")
        await storage.put_object(storage_key, image_bytes, mime_type="image/png")

        asset = LibraryAsset(
            id=asset_id,
            user_id=user.id,
            storage_key=storage_key,
            asset_type="image",
            source="ai_generated",
            tags=_generated_tags(
                req.requirement_description,
                aspect_ratio=req.aspect_ratio,
                asset_type="image",
            ),
        )
        db.add(asset)
        await db.commit()

        url = await storage.generate_download_url(storage_key)
        return GenerateSlotResponse(
            asset_id=str(asset_id),
            storage_key=storage_key,
            url=url,
            type="image",
            is_generated_standin=True,
        )

    result = await generate_missing_video_concept(
        req.requirement_description,
        brand_context,
        aspect_ratio=req.aspect_ratio,
        user_id=str(user.id),
    )
    budget.record(
        _IMAGE_GEN_COST_USD,
        action="image_gen",
        workspace_id=str(user.id),
        provider="gemini",
        metadata={"slot_type": "video_placeholder"},
    )
    asset_id = uuid.UUID(result["asset_id"])
    asset = LibraryAsset(
        id=asset_id,
        user_id=user.id,
        storage_key=result["video_key"],
        thumb_key=result.get("thumb_key"),
        asset_type="video",
        source="ai_generated",
        tags=_generated_tags(
            req.requirement_description,
            aspect_ratio=req.aspect_ratio,
            asset_type="video",
            duration_seconds=4.0,
        ),
    )
    db.add(asset)
    await db.commit()

    url = await storage.generate_download_url(result["video_key"])
    return GenerateSlotResponse(
        asset_id=str(asset_id),
        storage_key=result["video_key"],
        url=url,
        type="video",
        is_generated_standin=True,
    )
