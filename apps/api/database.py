"""
ViraEdit — Async database engine and session factory.

Uses SQLAlchemy 2.0 async API with asyncpg driver.
For migrations, uses psycopg2 (sync) so Alembic stays simple.
"""
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from config import settings

_raw_url = settings.DATABASE_URL

# Convert postgres:// → postgresql+asyncpg:// for async driver
def _make_async_url(url: str) -> str:
    url = url.replace("postgres://", "postgresql://")
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url

ASYNC_DATABASE_URL = _make_async_url(_raw_url)

# Primary engine — used by FastAPI (pooled)
engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=settings.DB_ECHO,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,  # reconnect on stale connections
)

# Test engine — used by pytest (no pool avoids inter-test state)
engine_test = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=False,
    poolclass=NullPool,
)

# Session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency — yields a DB session.
    Commits on success, rolls back on any exception.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
