"""
ViraEdit — Custom Starlette middleware.

1. RequestIDMiddleware:
   - Generates a unique request_id for every incoming request
   - Adds it to request.state and X-Request-ID response header
   - Binds it to structlog context so all logs include it automatically

2. LanguageDetectionMiddleware:
   - Detects if the request content relates to Nepali video content
   - Sets request.state.content_language ("ne" or "en")
   - Used by AI pipeline to apply the correct language model settings
"""
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

log = structlog.get_logger("viraedit.middleware")

# Nepali language indicators in Accept-Language header or custom header
_NEPALI_LANG_CODES = {"ne", "nep", "ne-NP", "ne_NP"}


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Assigns a unique request_id to every HTTP request.

    - Respects incoming X-Request-ID header (for tracing from API gateway)
    - Generates a new UUID if none provided
    - Attaches to response as X-Request-ID header
    - Binds to structlog context — all log lines within the request include it
    """

    def __init__(self, app: ASGIApp, header_name: str = "X-Request-ID") -> None:
        super().__init__(app)
        self.header_name = header_name

    async def dispatch(self, request: Request, call_next) -> Response:
        # Use incoming ID or generate new one
        request_id = request.headers.get(self.header_name) or f"req_{uuid.uuid4().hex[:12]}"

        # Store on request state for use in handlers + dependencies
        request.state.request_id = request_id

        # Bind to structlog so all log calls in this request include it
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        )

        response = await call_next(request)

        # Echo back in response header for client tracing
        response.headers[self.header_name] = request_id
        return response


class LanguageDetectionMiddleware(BaseHTTPMiddleware):
    """
    Detects whether the request is for Nepali content processing.

    Sets request.state.content_language:
        "ne"  — Nepali (default for all video processing)
        "en"  — English (for any explicitly English content)

    Detection sources (in priority order):
        1. X-Content-Language header (explicit override)
        2. Accept-Language header containing "ne"
        3. Default: "ne" (Nepali-first rule)

    NOTE: This is about VIDEO CONTENT language, not UI language.
    The UI is always English. The videos are always Nepali.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Check explicit override header first
        explicit_lang = request.headers.get("X-Content-Language", "").lower()

        if explicit_lang == "en":
            content_language = "en"
        elif explicit_lang == "ne" or not explicit_lang:
            # Check Accept-Language for Nepali, default to Nepali
            accept_lang = request.headers.get("Accept-Language", "")
            if any(code.lower() in accept_lang.lower() for code in _NEPALI_LANG_CODES):
                content_language = "ne"
            else:
                # Default: Nepali (we're a Nepali content tool)
                content_language = "ne"
        else:
            content_language = "ne"  # Unknown → default Nepali

        request.state.content_language = content_language

        # Bind to structlog context for tracing
        structlog.contextvars.bind_contextvars(content_language=content_language)

        return await call_next(request)


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    Logs every request with method, path, status code, and duration.
    Skips health check endpoints to reduce noise.
    """

    _SKIP_PATHS = {"/health", "/favicon.ico", "/docs", "/redoc", "/openapi.json"}

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in self._SKIP_PATHS:
            return await call_next(request)

        import time
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 1)

        level = "warning" if response.status_code >= 400 else "info"
        getattr(log, level)(
            "http_request",
            status_code=response.status_code,
            duration_ms=duration_ms,
        )

        return response
