"""
ElevenLabs STT connectivity checks for health endpoints and startup.
"""
from __future__ import annotations

from typing import Any

import httpx


def validate_api_key_format(api_key: str) -> str | None:
    """
    Return None if the key looks valid, else a human-readable error message.
    """
    if not api_key or not api_key.strip():
        return "ELEVENLABS_API_KEY is not set in .env"
    key = api_key.strip()
    if key.startswith("sk_"):
        if len(key) < 40:
            return "ELEVENLABS_API_KEY looks truncated (too short)."
        return None
    if len(key) == 64 and all(c in "0123456789abcdef" for c in key.lower()):
        return None
    if len(key) == 32 and all(c in "0123456789abcdef" for c in key.lower()):
        return (
            "ELEVENLABS_API_KEY looks like a dashboard ID, not a secret key. "
            "Create an API key at elevenlabs.io — the secret starts with sk_ "
            "and is only shown once when you create it."
        )
    return (
        "ELEVENLABS_API_KEY format is invalid. ElevenLabs secret keys start with sk_. "
        "Copy the full key from Settings → API Keys on elevenlabs.io."
    )


def check_elevenlabs_account(api_key: str | None = None) -> dict[str, Any]:
    """
    Call GET /v1/user to verify the key and read subscription tier.
    """
    if api_key is None:
        from config import settings
        api_key = settings.ELEVENLABS_API_KEY
    key = (api_key or "").strip()
    fmt_err = validate_api_key_format(key)
    if fmt_err:
        return {"status": "error", "error": fmt_err}

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(
                "https://api.elevenlabs.io/v1/user",
                headers={"xi-api-key": key},
            )
        if resp.status_code == 401:
            body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            detail = body.get("detail", {}) if isinstance(body, dict) else {}
            msg = detail.get("message", "Invalid API key") if isinstance(detail, dict) else "Invalid API key"
            status = detail.get("status", "") if isinstance(detail, dict) else ""
            if status == "detected_unusual_activity":
                return {
                    "status": "error",
                    "error": (
                        "ElevenLabs blocked free-tier usage on this account. "
                        "Upgrade to a paid plan or use a different account, then update .env."
                    ),
                }
            return {"status": "error", "error": f"ElevenLabs authentication failed: {msg}"}

        resp.raise_for_status()
        data = resp.json()
        sub = data.get("subscription") or {}
        return {
            "status": "ok",
            "tier": sub.get("tier"),
            "character_count": sub.get("character_count"),
            "character_limit": sub.get("character_limit"),
            "key_prefix": key[:7] + "...",
        }
    except httpx.HTTPError as exc:
        return {"status": "error", "error": f"Could not reach ElevenLabs: {exc}"}
