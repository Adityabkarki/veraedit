"""Clear all saved style transfer presets from Brand.style_dna."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text
from config import settings


def main() -> None:
    sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
    engine = create_engine(sync_url)
    empty = json.dumps({"presets": []})
    with engine.begin() as conn:
        result = conn.execute(
            text(
                "UPDATE brands SET style_dna = CAST(:dna AS jsonb), updated_at = NOW() "
                "WHERE style_dna IS NOT NULL RETURNING id"
            ),
            {"dna": empty},
        )
        rows = result.fetchall()
    engine.dispose()
    print(f"Cleared style presets on {len(rows)} brand row(s).")


if __name__ == "__main__":
    main()
