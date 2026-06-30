"""
ViraEdit — Synchronous job helpers for Celery workers.
"""
from __future__ import annotations

import json
from typing import Any, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from config import settings
from models.job import Job


def _sync_db_url() -> str:
    return settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")


def _engine():
    return create_engine(_sync_db_url(), pool_pre_ping=True)


def update_job_sync(
    job_id: str,
    *,
    status: Optional[str] = None,
    result: Optional[dict[str, Any]] = None,
    error: Optional[str] = None,
) -> None:
    """Update a job row from a Celery worker."""
    sets: list[str] = []
    params: dict[str, Any] = {"id": job_id}

    if status is not None:
        sets.append("status = :status")
        params["status"] = status
    if result is not None:
        sets.append("result = CAST(:result AS jsonb)")
        params["result"] = json.dumps(result)
    if error is not None:
        sets.append("error = :error")
        params["error"] = error

    if not sets:
        return

    sql = f"UPDATE jobs SET {', '.join(sets)}, updated_at = NOW() WHERE id = :id"
    with _engine().begin() as conn:
        conn.execute(text(sql), params)


def get_job_sync(job_id: str) -> Optional[Job]:
    """Load a job by ID from a Celery worker."""
    import uuid as uuid_mod

    SessionLocal = sessionmaker(bind=_engine())
    with SessionLocal() as session:
        try:
            jid = uuid_mod.UUID(job_id)
        except ValueError:
            return None
        return session.get(Job, jid)
