"""One-off: set asset to ANALYZING and queue chapter analysis."""
from __future__ import annotations

import sys

from sqlalchemy import create_engine, text

from celery_app import celery_app
from config import settings


def main() -> None:
    asset_id = sys.argv[1] if len(sys.argv) > 1 else "654d8869-f7bf-4404-a7a8-736bc3d5388d"
    scope = sys.argv[2] if len(sys.argv) > 2 else "chapters"
    sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    engine = create_engine(sync_url)
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT status, error_message FROM assets WHERE id=:id"),
            {"id": asset_id},
        ).fetchone()
        if not row:
            print("asset not found:", asset_id)
            sys.exit(1)
        print("before:", row.status, (row.error_message or "")[:120])
        conn.execute(
            text(
                "UPDATE assets SET status='ANALYZING', error_message=NULL, "
                "updated_at=NOW() WHERE id=:id"
            ),
            {"id": asset_id},
        )
    result = celery_app.send_task(
        "tasks.analyze.run",
        kwargs={"asset_id": asset_id, "scope": scope},
        queue="analysis",
    )
    print("queued:", result.id, "scope=", scope)


if __name__ == "__main__":
    main()
