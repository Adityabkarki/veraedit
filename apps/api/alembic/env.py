"""
ViraEdit — Alembic environment configuration.

Supports both sync (offline) and async (online) migration modes.
Reads DATABASE_URL from .env file automatically.

Usage:
    alembic upgrade head          # Apply all pending migrations
    alembic downgrade -1          # Revert last migration
    alembic revision --autogenerate -m "add new table"  # Auto-generate migration
"""
import asyncio
import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# Add apps/api to Python path so models can be imported
sys.path.insert(0, str(Path(__file__).parent.parent))

# Load .env if available
try:
    from dotenv import load_dotenv
    # Look for .env in project root (3 levels up from alembic/)
    env_path = Path(__file__).parent.parent.parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        # Fallback: look for .env next to alembic.ini
        load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass  # python-dotenv not installed — rely on system env vars

# Import all models so Alembic can discover them for autogenerate
from models import Base  # noqa: E402 — must be after sys.path setup

# Alembic config object from alembic.ini
config = context.config

# Set up logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# This is what Alembic compares against your DB to find changes
target_metadata = Base.metadata

# Build the database URL from env
def get_database_url() -> str:
    """Get async-compatible database URL for migrations."""
    raw_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://viraedit:viraedit_dev_password@localhost:5432/viraedit",
    )
    # Ensure we have the asyncpg driver prefix
    raw_url = raw_url.replace("postgres://", "postgresql://")
    if not raw_url.startswith("postgresql+asyncpg://"):
        raw_url = raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return raw_url


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode.
    Generates SQL script without connecting to DB.
    Useful for reviewing SQL before applying.
    """
    url = get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Execute migrations using the provided connection."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations in async mode (required for asyncpg driver)."""
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_database_url()

    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,  # No pool for migrations
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode — connects to DB and applies changes."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
