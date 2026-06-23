"""One-off: fix demo user email + password for local login."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from auth.password import hash_password
from config import settings
from sqlalchemy import create_engine, text


def main() -> None:
    password_hash = hash_password("demo1234")
    url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    engine = create_engine(url)
    with engine.begin() as conn:
        for old_email in ("demo@viraedit.local", "demo@example.com"):
            r = conn.execute(
                text(
                    "UPDATE users SET email = :new_email, password_hash = :h "
                    "WHERE email = :old_email"
                ),
                {
                    "new_email": "demo@example.com",
                    "h": password_hash,
                    "old_email": old_email,
                },
            )
            if r.rowcount:
                print(f"Updated {r.rowcount} row(s) from {old_email}")
    engine.dispose()
    print("Demo login: demo@example.com / demo1234")


if __name__ == "__main__":
    main()
