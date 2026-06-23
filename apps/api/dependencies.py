"""
ViraEdit — FastAPI dependency injection.

All shared resources are provided as FastAPI dependencies:
    - get_db()           → AsyncSession (database session)
    - get_current_user() → User (authenticated user, raises 401 if not authed)
    - get_storage()      → StorageService (MinIO/S3 abstraction)
    - get_cost_tracker() → CostTracker (AI budget enforcement)
    - get_redis()        → Redis client

EP-1.1: Stubs for current_user, storage, cost_tracker (implemented in EP-1.2/1.3).
EP-1.2: current_user reads JWT token.
EP-1.3: StorageService fully implemented.
"""
from __future__ import annotations

from typing import Annotated, AsyncGenerator

import structlog
from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, get_db
from exceptions import NotAuthenticatedError

log = structlog.get_logger("viraedit.deps")

# ── Database ───────────────────────────────────────────────────────────────────

# Re-export get_db from database module for convenience
# Usage: db: Annotated[AsyncSession, Depends(get_db)]
DbDep = Annotated[AsyncSession, Depends(get_db)]


# ── Current User (JWT auth — implemented in EP-1.2) ──────────────────────────

async def get_current_user(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> "User":
    """
    Dependency that returns the authenticated user.

    Parses the Bearer JWT token from Authorization header,
    verifies it against the Redis blacklist, and loads the User from DB.

    Raises NotAuthenticatedError (→ 401) if token is missing or invalid.
    """
    from auth.jwt import TokenType, decode_token
    from models import User
    from sqlalchemy import select

    if not authorization or not authorization.startswith("Bearer "):
        raise NotAuthenticatedError(
            message="Please sign in to access this feature."
        )

    token = authorization.removeprefix("Bearer ").strip()

    try:
        payload = decode_token(token, expected_type=TokenType.ACCESS)
    except ValueError:
        raise NotAuthenticatedError(
            message="Your session has expired. Please sign in again."
        )

    user_id = payload.get("sub")

    # Lazy import to avoid circular at module load
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise NotAuthenticatedError(
            message="Your account was not found. Please sign in again."
        )

    return user


# Type alias — routes declare:  current_user: CurrentUser
# The actual type at runtime is models.User
CurrentUser = Annotated[object, Depends(get_current_user)]


# ── Storage Service (EP-1.3 — fully implemented in storage.py) ───────────────

from storage import StorageService, get_storage  # noqa: E402 (after class defs)

StorageDep = Annotated[StorageService, Depends(get_storage)]


# ── Cost Tracker (stub — fully implemented with AI pipeline) ──────────────────

class CostTracker:
    """
    Tracks AI API costs per project and enforces the $2.00/hr budget limit.
    Fully integrated in EP-2.1 (Analysis Pipeline).

    Every AI call routes through this tracker:
        1. Check if project is within budget
        2. Make the API call
        3. Log the actual cost
    """

    async def check_budget(self, project_id: str, db: AsyncSession) -> None:
        """
        Raise BudgetExceededError if project has hit the cost limit.
        TODO (EP-2.1): Implement with Cost model SUM query.
        """
        pass  # Stub — no enforcement until EP-2.1

    async def log_cost(
        self,
        project_id: str,
        model: str,
        task: str,
        cost_usd: float,
        db: AsyncSession,
        asset_id: str | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        audio_seconds: float | None = None,
    ) -> None:
        """
        Insert a Cost record for an AI API call.
        TODO (EP-2.1): Implement with Cost ORM model.
        """
        log.info(
            "ai_cost_logged",
            project_id=project_id,
            model=model,
            task=task,
            cost_usd=cost_usd,
        )


_cost_tracker_instance = CostTracker()


async def get_cost_tracker() -> CostTracker:
    """FastAPI dependency — returns singleton CostTracker."""
    return _cost_tracker_instance


CostTrackerDep = Annotated[CostTracker, Depends(get_cost_tracker)]


# ── Redis ──────────────────────────────────────────────────────────────────────

_redis_client = None


async def get_redis():
    """
    FastAPI dependency — returns async Redis client.
    Fully initialized in EP-1.2 (JWT blacklist) and EP-2.x (caching).
    """
    global _redis_client
    if _redis_client is None:
        try:
            import redis.asyncio as aioredis
            from config import settings
            _redis_client = aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )
        except Exception as e:
            log.warning("redis_unavailable", error=str(e))
            return None
    return _redis_client


RedisDep = Annotated[object, Depends(get_redis)]
