"""Quick schema check for editorial upgrade columns."""
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from config import settings


async def main() -> None:
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        rows = await conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='scenes' ORDER BY 1"
            )
        )
        print("scenes columns:", [r[0] for r in rows.fetchall()])
        row = await conn.execute(
            text(
                "SELECT COUNT(*) FROM information_schema.tables "
                "WHERE table_name = 'highlights'"
            )
        )
        print("highlights table exists:", row.scalar() > 0)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
