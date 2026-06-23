"""Built-in SFX library — royalty-free sounds for preview + timeline."""
from __future__ import annotations

from fastapi import APIRouter

from dependencies import DbDep
from services.sfx_library import get_sfx_library

router = APIRouter(prefix="/api/v1/sfx", tags=["sfx"])


@router.get("/library")
async def list_sfx_library(db: DbDep) -> dict:
    """Return catalog of bundled SFX (DB when seeded, else JSON + /sfx/*.mp3)."""
    return await get_sfx_library(db)
