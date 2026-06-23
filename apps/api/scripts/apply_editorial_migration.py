"""Apply editorial upgrade migration when alembic CLI is broken."""
from __future__ import annotations

import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from config import settings

SQL = """
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS scene_kind VARCHAR(20) NOT NULL DEFAULT 'chapter';
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
CREATE INDEX IF NOT EXISTS ix_scenes_scene_kind ON scenes (scene_kind);

CREATE TABLE IF NOT EXISTS highlights (
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    start_time DOUBLE PRECISION NOT NULL,
    end_time DOUBLE PRECISION NOT NULL,
    title VARCHAR(500),
    summary TEXT,
    promo_copy_en TEXT,
    promo_caption_ne TEXT,
    highlight_score DOUBLE PRECISION,
    platform_packs JSONB,
    thumbnail_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'detected',
    superseded BOOLEAN NOT NULL DEFAULT false,
    id UUID NOT NULL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_highlights_asset_id ON highlights (asset_id);
CREATE INDEX IF NOT EXISTS ix_highlights_project_id ON highlights (project_id);

INSERT INTO alembic_version (version_num)
SELECT 'b2c3d4e5f6a7'
WHERE NOT EXISTS (
    SELECT 1 FROM alembic_version WHERE version_num = 'b2c3d4e5f6a7'
);
"""


async def main() -> None:
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        # alembic_version may not exist on very old DBs
        await conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"
            )
        )
        for stmt in SQL.strip().split(";"):
            s = stmt.strip()
            if s:
                await conn.execute(text(s))
    await engine.dispose()
    print("Editorial migration applied (scene_kind, thumbnail_url, highlights).")


if __name__ == "__main__":
    asyncio.run(main())
