"""
ViraEdit — Health check endpoints.

GET /health          → simple liveness check (load balancer ping)
GET /health/detailed → full system status (DB, Redis, MinIO, workers)

The simple /health must respond in < 100ms — no DB queries.
The detailed check is for monitoring dashboards only.
"""
import time
from typing import Any

import structlog
from fastapi import APIRouter, Request

log = structlog.get_logger("viraedit.health")

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check(request: Request) -> dict[str, Any]:
    """
    Simple liveness check.
    Returns 200 immediately — used by Docker, load balancers, and health_check.bat.
    """
    return {
        "status": "ok",
        "service": "viraedit-api",
        "request_id": getattr(request.state, "request_id", None),
    }


@router.get("/health/detailed")
async def health_check_detailed(request: Request) -> dict[str, Any]:
    """
    Full system health — checks DB, Redis, MinIO connectivity.
    Use for monitoring dashboards. Not suitable for load-balancer ping (may be slow).
    """
    results: dict[str, Any] = {
        "status": "ok",
        "service": "viraedit-api",
        "request_id": getattr(request.state, "request_id", None),
        "checks": {},
    }

    overall_ok = True

    # ── PostgreSQL check ──────────────────────────────────────────────────────
    try:
        from database import engine
        t0 = time.perf_counter()
        async with engine.connect() as conn:
            from sqlalchemy import text
            await conn.execute(text("SELECT 1"))
        db_ms = round((time.perf_counter() - t0) * 1000, 1)
        results["checks"]["database"] = {"status": "ok", "latency_ms": db_ms}
    except Exception as e:
        results["checks"]["database"] = {"status": "error", "error": str(e)}
        overall_ok = False
        log.error("health_check_db_failed", error=str(e))

    # ── Redis check ───────────────────────────────────────────────────────────
    try:
        import redis.asyncio as aioredis
        from config import settings
        r = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        t0 = time.perf_counter()
        await r.ping()
        redis_ms = round((time.perf_counter() - t0) * 1000, 1)
        await r.aclose()
        results["checks"]["redis"] = {"status": "ok", "latency_ms": redis_ms}
    except Exception as e:
        results["checks"]["redis"] = {"status": "error", "error": str(e)}
        overall_ok = False
        log.error("health_check_redis_failed", error=str(e))

    # ── MinIO check ───────────────────────────────────────────────────────────
    try:
        import httpx
        from config import settings
        t0 = time.perf_counter()
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{settings.S3_ENDPOINT_URL}/minio/health/live")
        minio_ms = round((time.perf_counter() - t0) * 1000, 1)
        if resp.status_code == 200:
            results["checks"]["minio"] = {"status": "ok", "latency_ms": minio_ms}
        else:
            results["checks"]["minio"] = {
                "status": "error",
                "http_status": resp.status_code,
            }
            overall_ok = False
    except Exception as e:
        results["checks"]["minio"] = {"status": "error", "error": str(e)}
        overall_ok = False
        log.error("health_check_minio_failed", error=str(e))

    # ── ElevenLabs STT (Scribe) ───────────────────────────────────────────────
    try:
        from services.elevenlabs_health import check_elevenlabs_account

        el = check_elevenlabs_account()
        results["checks"]["elevenlabs_stt"] = el
        if el.get("status") != "ok":
            overall_ok = False
    except Exception as e:
        results["checks"]["elevenlabs_stt"] = {"status": "error", "error": str(e)}
        overall_ok = False
        log.error("health_check_elevenlabs_failed", error=str(e))

    if not overall_ok:
        results["status"] = "degraded"

    return results
