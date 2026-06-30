"""
ViraEdit — Local AI fallback helpers (Phase 08).

Wraps Ollama/local model calls with validation so garbage JSON never
surfaces as opaque 500 errors.
"""
from __future__ import annotations

import json
from typing import Any, Awaitable, Callable, TypeVar

import structlog

log = structlog.get_logger("viraedit.ai_fallback")

T = TypeVar("T")


async def call_with_local_fallback(
    primary_call: Callable[[], Awaitable[T | None]],
    fallback_call: Callable[[], Awaitable[T | None]],
    *,
    action_name: str,
) -> T:
    """
    Try primary (cloud) first, then local fallback with strict validation.
    Raises RuntimeError with a user-readable message if both fail.
    """
    try:
        result = await primary_call()
        if result is not None:
            return result
    except Exception as exc:
        log.warning("ai_primary_failed", action=action_name, error=str(exc))

    try:
        result = await fallback_call()
        if result is None or (isinstance(result, list) and not result):
            raise ValueError("Local model returned empty output")
        return result
    except Exception as exc:
        log.warning("ai_local_fallback_failed", action=action_name, error=str(exc))
        raise RuntimeError(
            f"Couldn't complete {action_name} right now — the AI budget limit was "
            f"reached and the backup option didn't produce usable results. "
            f"Try again in a moment, or contact your workspace owner about the AI budget."
        ) from exc


async def ollama_json_completion(prompt: str, *, model: str = "llama3.1:8b") -> Any:
    """Call local Ollama and parse JSON from the response."""
    import urllib.request

    payload = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {"temperature": 0.2},
    }).encode("utf-8")

    req = urllib.request.Request(
        "http://localhost:11434/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())

    raw = (data.get("message") or {}).get("content", "").strip()
    if not raw:
        raise ValueError("Ollama returned an empty response")

    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    return json.loads(raw)
