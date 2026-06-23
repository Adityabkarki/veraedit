"""
Seed sfx_library table from data/sfx_catalog.json.

Run after fetch_sfx_library.py:
    cd apps/api
    python -m scripts.seed_sfx_library
"""
from __future__ import annotations

import asyncio
import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent.parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()
except ImportError:
    pass

import os
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from models.sfx_library import SfxLibraryItem

DATA_PATH = Path(__file__).parent.parent / "data" / "sfx_catalog.json"


def _make_async_url(url: str) -> str:
    url = url.replace("postgres://", "postgresql://")
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


async def seed() -> None:
    catalog = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    items = catalog.get("items", [])
    if not items:
        print("No catalog items — run fetch_sfx_library first")
        return

    db_url = _make_async_url(
        os.environ.get(
            "DATABASE_URL",
            "postgresql://viraedit:viraedit_dev_password@localhost:5432/viraedit",
        )
    )
    engine = create_async_engine(db_url, echo=False)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        for raw in items:
            slug = raw["slug"]
            existing = await db.execute(select(SfxLibraryItem).where(SfxLibraryItem.slug == slug))
            row = existing.scalar_one_or_none()
            file_name = str(raw.get("file_name") or f"{slug}.mp3")
            payload = dict(
                name=raw["name"],
                category=raw["category"],
                file_name=file_name,
                duration_ms=int(raw.get("duration_ms", 300)),
                mixkit_id=int(raw["mixkit_id"]) if raw.get("mixkit_id") else None,
                license_name="Mixkit",
                source_url=raw.get("source_url"),
                tags=raw.get("tags") or [],
                tool_ids=raw.get("tool_ids") or [],
            )
            if row:
                for k, v in payload.items():
                    setattr(row, k, v)
            else:
                db.add(SfxLibraryItem(id=uuid.uuid4(), slug=slug, **payload))
        await db.commit()
    await engine.dispose()
    print(f"Seeded {len(items)} SFX rows into sfx_library")


if __name__ == "__main__":
    asyncio.run(seed())
