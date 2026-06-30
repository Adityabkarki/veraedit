"""
ViraEdit — FastAPI application entry point.

Start with:
    cd apps/api
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

Or via the dev script:
    scripts\\dev.bat
"""
from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager
from typing import Any

import structlog
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from config import settings
from exceptions import ViraEditError
from logging_config import configure_logging
from middleware import LanguageDetectionMiddleware, LoggingMiddleware, RequestIDMiddleware
from routers import asset_library, assets, auth, captions, chapters, costs, gap_resolution, health, ingest, platform_shorts, project_media, projects, renders, sfx, shorts, sizzle, style_clone, style_intelligence, styles, tasks, templates, text_editor, timelines
from ws.forwarder import run_redis_forwarder
from ws.manager import ws_manager
from ws.router import router as ws_router

log = structlog.get_logger("viraedit.app")


def _response_headers(request: Request, request_id: str | None = None) -> dict[str, str]:
    """Standard headers including CORS — required on error responses too."""
    headers: dict[str, str] = {}
    if request_id:
        headers["X-Request-ID"] = request_id
    origin = request.headers.get("origin")
    if origin and origin in settings.CORS_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return headers


# ── Lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan — runs startup/shutdown code.

    Startup:
      1. Configure structlog (pretty dev / JSON prod)
      2. Verify database connectivity
      3. Log startup summary

    Shutdown:
      1. Close database connection pool
      2. Close Redis connection
    """
    # Configure logging first so all startup messages are structured
    configure_logging(settings.ENVIRONMENT)

    log.info(
        "viraedit_api_starting",
        environment=settings.ENVIRONMENT,
        version=settings.APP_VERSION,
        port=settings.API_PORT,
        whisper_language=settings.WHISPER_LANGUAGE,  # should always be "ne"
    )

    from services.elevenlabs_health import check_elevenlabs_account

    el = check_elevenlabs_account()
    if el.get("status") == "ok":
        log.info(
            "elevenlabs_stt_configured",
            tier=el.get("tier"),
            key_prefix=el.get("key_prefix"),
        )
    else:
        log.warning("elevenlabs_stt_misconfigured", error=el.get("error"))

    # Verify DB is reachable (fail fast if misconfigured)
    try:
        from database import engine
        from sqlalchemy import text
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        log.info("database_connected")
    except Exception as e:
        log.error("database_connection_failed", error=str(e))
        # Don't crash on startup — let /health/detailed report the issue
        # App can still serve static routes while DB reconnects

    # Initialize Redis client and store on app.state so auth router can reach it
    try:
        import redis.asyncio as aioredis
        app.state.redis = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        # Ping to verify connectivity
        await app.state.redis.ping()
        log.info("redis_connected")
    except Exception as e:
        log.warning("redis_unavailable", error=str(e), hint="Auth blacklist disabled")
        app.state.redis = None

    log.info("viraedit_api_ready", docs_url=f"http://localhost:{settings.API_PORT}/docs")

    # WebSocket Redis forwarder (EP-6.1)
    forwarder_task: asyncio.Task | None = None
    if getattr(app.state, "redis", None) is not None:
        forwarder_task = asyncio.create_task(
            run_redis_forwarder(app.state.redis, ws_manager)
        )
        app.state.ws_forwarder_task = forwarder_task

    yield  # ← App runs here

    # Shutdown
    if forwarder_task is not None:
        forwarder_task.cancel()
        try:
            await forwarder_task
        except asyncio.CancelledError:
            pass
    log.info("viraedit_api_stopping")
    try:
        from database import engine
        await engine.dispose()
        log.info("database_pool_closed")
    except Exception as e:
        log.warning("database_pool_close_failed", error=str(e))

    # Close Redis connection
    if getattr(app.state, "redis", None) is not None:
        await app.state.redis.aclose()
        log.info("redis_closed")

    log.info("viraedit_api_stopped")


# ── Application ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="ViraEdit API",
    description=(
        "AI-native video editing platform for Nepali content creators.\n\n"
        "Transcribes Nepali speech, detects viral moments, and produces polished edits."
    ),
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    # Disable FastAPI's default exception handler — we use our own
    responses={
        400: {"description": "Bad request"},
        401: {"description": "Not authenticated"},
        403: {"description": "Forbidden"},
        404: {"description": "Not found"},
        422: {"description": "Validation error"},
        500: {"description": "Internal server error"},
    },
)


# ── Middleware (order matters — outermost runs first) ──────────────────────────

# 1. Request ID — first so all other middleware can log with it
app.add_middleware(RequestIDMiddleware)

# 2. Language detection — sets request.state.content_language
app.add_middleware(LanguageDetectionMiddleware)

# 3. HTTP request logging
app.add_middleware(LoggingMiddleware)

# 4. CORS — must be after custom middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


# ── Rate limiting ──────────────────────────────────────────────────────────────
# Simple in-memory rate limiting via slowapi (Redis-backed in production)
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.util import get_remote_address

    limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
except ImportError:
    # slowapi not installed — rate limiting disabled (install: pip install slowapi)
    log.warning("slowapi_not_installed", hint="Rate limiting disabled. pip install slowapi")


# ── Exception handlers ────────────────────────────────────────────────────────

@app.exception_handler(ViraEditError)
async def viraedit_error_handler(request: Request, exc: ViraEditError) -> JSONResponse:
    """Handle all ViraEdit application errors — returns standard error JSON."""
    request_id = getattr(request.state, "request_id", None)
    log.warning(
        "viraedit_error",
        error_code=exc.error_code,
        message=exc.message,
        status_code=exc.status_code,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.to_dict(request_id=request_id),
        headers=_response_headers(request, request_id),
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """
    Handle Pydantic validation errors.
    Converts FastAPI's technical 422 messages into human-readable English.
    """
    request_id = getattr(request.state, "request_id", None)

    # Pydantic v2 puts the original exception object in ctx["error"] — not JSON-serializable.
    # Sanitize each error dict so JSONResponse can encode it safely.
    def _sanitize_error(e: dict) -> dict:
        sanitized = {k: v for k, v in e.items() if k not in ("ctx", "url")}
        if "ctx" in e:
            sanitized["ctx"] = {
                k: str(v) if not isinstance(v, (str, int, float, bool, type(None))) else v
                for k, v in e["ctx"].items()
            }
        return sanitized

    raw_errors = exc.errors()
    errors = [_sanitize_error(e) for e in raw_errors]

    # Build a friendly message from the first validation error
    if errors:
        first = errors[0]
        field = " → ".join(str(loc) for loc in first.get("loc", []))
        msg = first.get("msg", "Invalid value")
        friendly_message = f"Invalid input for '{field}': {msg}."
    else:
        friendly_message = "The request data is invalid. Please check your input."

    log.info("validation_error", error_count=len(errors))

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "VALIDATION_ERROR",
            "message": friendly_message,
            "request_id": request_id,
            "details": {"errors": errors},
        },
        headers=_response_headers(request, request_id),
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """Handle HTTP exceptions (404, 405, etc.) in standard ViraEdit format."""
    request_id = getattr(request.state, "request_id", None)

    # Map status codes to friendly messages
    messages = {
        404: "The page or resource you requested doesn't exist.",
        405: "This action isn't supported for this endpoint.",
        408: "The request took too long. Please try again.",
        429: "Too many requests. Please slow down and try again in a moment.",
        500: "Something went wrong on our end. Please try again.",
        503: "The service is temporarily unavailable. Please try again shortly.",
    }

    content: dict[str, object] = {
        "error": f"HTTP_{exc.status_code}",
        "request_id": request_id,
    }
    if isinstance(exc.detail, dict):
        # Preserve structured 400s (e.g. regeneration cost confirmation).
        content["message"] = exc.detail.get("message") or messages.get(
            exc.status_code, "Invalid request."
        )
        content["detail"] = exc.detail
    else:
        default = messages.get(exc.status_code)
        content["message"] = default if default else str(exc.detail)

    return JSONResponse(
        status_code=exc.status_code,
        content=content,
        headers=_response_headers(request, request_id),
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Catch-all for unexpected errors.
    Logs the full stack trace but returns a safe message to the client.
    """
    request_id = getattr(request.state, "request_id", None)
    log.error(
        "unhandled_exception",
        error=str(exc),
        error_type=type(exc).__name__,
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "INTERNAL_ERROR",
            "message": (
                "An unexpected error occurred. "
                "Our team has been notified. Please try again in a moment."
            ),
            "request_id": request_id,
        },
        headers=_response_headers(request, request_id),
    )


# ── Routers ────────────────────────────────────────────────────────────────────

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(assets.router)
app.include_router(project_media.router)
app.include_router(asset_library.router)
app.include_router(gap_resolution.router)
app.include_router(ingest.router)
app.include_router(templates.router)
app.include_router(style_clone.router)
app.include_router(style_intelligence.router)
app.include_router(captions.router)
app.include_router(text_editor.router)
app.include_router(timelines.router)
app.include_router(styles.router)
app.include_router(styles.toolbox_router)
app.include_router(tasks.router)
app.include_router(renders.router)
app.include_router(shorts.router)
app.include_router(platform_shorts.router)
app.include_router(chapters.router)
app.include_router(sizzle.router)
app.include_router(costs.router)
app.include_router(sfx.router)
app.include_router(ws_router)

# EP-2.x will add:

# EP-1.3 will add:
# from routers import projects, assets
# app.include_router(projects.router, prefix="/api/v1")
# app.include_router(assets.router, prefix="/api/v1")


# ── Root endpoint ─────────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    """Redirect hint for API root."""
    return {
        "service": "ViraEdit API",
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "health": "/health",
    }
