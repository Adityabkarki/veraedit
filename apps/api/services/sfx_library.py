"""SFX catalog — JSON fallback + PostgreSQL."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.sfx_library import SfxLibraryItem

log = structlog.get_logger("viraedit.sfx_library")

CATALOG_PATH = Path(__file__).parent.parent / "data" / "sfx_catalog.json"
STATIC_SFX_DIR = Path(__file__).parent.parent / "static" / "sfx"


@lru_cache(maxsize=1)
def load_json_catalog() -> dict[str, Any]:
    if not CATALOG_PATH.exists():
        return {"license": "", "items": []}
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def json_catalog_items() -> list[dict[str, Any]]:
    catalog = load_json_catalog()
    items: list[dict[str, Any]] = []
    for raw in catalog.get("items", []):
        slug = str(raw["slug"])
        file_name = str(raw.get("file_name") or f"{slug}.mp3")
        items.append(
            {
                "slug": slug,
                "name": raw["name"],
                "category": raw["category"],
                "file_name": file_name,
                "duration_ms": int(raw.get("duration_ms", 300)),
                "preview_url": f"/sfx/{file_name}",
                "tags": raw.get("tags") or [],
                "tool_ids": raw.get("tool_ids") or [],
                "license": catalog.get("license", "Mixkit"),
                "mixkit_id": raw.get("mixkit_id"),
            }
        )
    return items


def resolve_sfx_slug(sfx_type: str, tool_id: str | None = None) -> str:
    """Map legacy sfx_type / toolbox tool id → catalog slug."""
    t = sfx_type.lower().strip()
    slugs = {item["slug"] for item in json_catalog_items()}

    for item in json_catalog_items():
        if tool_id and tool_id in (item.get("tool_ids") or []):
            return item["slug"]

    aliases: dict[str, str] = {
        "whoosh": "whoosh",
        "swish": "whoosh_arrow",
        "click": "shutter_click",
        "shutter_click": "shutter_click",
        "sub_bass": "sub_bass",
        "sub_bass_thud": "sub_bass",
        "sfx_on_cut": "whoosh",
        "sfx_whoosh_cut": "whoosh",
        "sfx_shutter_click": "shutter_click",
        "sfx_sub_bass_thud": "sub_bass",
        "sfx_impact_hit": "impact_hit",
        "sfx_pop": "pop",
        "sfx_swipe": "swipe",
        "sfx_glitch": "glitch",
        "sfx_riser": "riser",
        "sfx_notification": "notification",
    }
    if tool_id and tool_id in aliases:
        return aliases[tool_id]
    if t in slugs:
        return t
    if t in aliases:
        return aliases[t]

    for item in json_catalog_items():
        for tid in item.get("tool_ids") or []:
            if t == tid.replace("sfx_", ""):
                return item["slug"]

    return "whoosh"


def local_sfx_path(slug: str) -> Path | None:
    p = STATIC_SFX_DIR / f"{slug}.mp3"
    return p if p.is_file() else None


async def list_sfx_from_db(db: AsyncSession) -> list[dict[str, Any]] | None:
    result = await db.execute(select(SfxLibraryItem).order_by(SfxLibraryItem.category, SfxLibraryItem.name))
    rows = result.scalars().all()
    if not rows:
        return None
    return [row.to_dict() for row in rows]


async def get_sfx_library(db: AsyncSession | None = None) -> dict[str, Any]:
    if db is not None:
        try:
            db_items = await list_sfx_from_db(db)
            if db_items:
                return {
                    "count": len(db_items),
                    "license": load_json_catalog().get("license", "Mixkit"),
                    "items": db_items,
                }
        except Exception as exc:
            log.warning("sfx_db_fallback_json", error=str(exc))

    items = json_catalog_items()
    return {
        "count": len(items),
        "license": load_json_catalog().get("license", "Mixkit"),
        "items": items,
    }
