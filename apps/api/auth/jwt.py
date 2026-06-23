"""
ViraEdit — JWT token utilities.

Access token:  15 minutes, used on every API request
Refresh token: 7 days, used ONLY to get a new access token
               stored in Redis so we can blacklist it on logout

Token payload (claims):
    sub   — user ID (UUID string)
    email — user email (for convenience)
    type  — "access" | "refresh"
    jti   — unique token ID (UUID hex, used for Redis blacklist key)
    iat   — issued-at timestamp
    exp   — expiry timestamp (set by python-jose automatically)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any

from jose import JWTError, jwt

from config import settings

# ── Token lifetime constants (from settings — override via .env) ───────────────

ACCESS_TOKEN_EXPIRE_MINUTES: int = settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
REFRESH_TOKEN_EXPIRE_DAYS: int = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS

# ── Algorithm ─────────────────────────────────────────────────────────────────

ALGORITHM = "HS256"


class TokenType(str, Enum):
    ACCESS = "access"
    REFRESH = "refresh"


# ── Token creation ─────────────────────────────────────────────────────────────

def _make_token(
    user_id: str,
    email: str,
    token_type: TokenType,
    expires_delta: timedelta,
) -> tuple[str, str]:
    """
    Create a signed JWT.

    Returns:
        (encoded_token, jti) — jti is the unique token ID for blacklisting.
    """
    jti = uuid.uuid4().hex  # unique per token — used as Redis key for blacklisting
    now = datetime.now(tz=timezone.utc)

    payload: dict[str, Any] = {
        "sub": user_id,
        "email": email,
        "type": token_type.value,
        "jti": jti,
        "iat": now,
        "exp": now + expires_delta,
    }

    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=ALGORITHM)
    return token, jti


def create_access_token(user_id: str, email: str) -> tuple[str, str]:
    """
    Create a short-lived access token (15 min).

    Returns:
        (token_string, jti)
    """
    return _make_token(
        user_id=user_id,
        email=email,
        token_type=TokenType.ACCESS,
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(user_id: str, email: str) -> tuple[str, str]:
    """
    Create a long-lived refresh token (7 days).

    Returns:
        (token_string, jti)
    """
    return _make_token(
        user_id=user_id,
        email=email,
        token_type=TokenType.REFRESH,
        expires_delta=timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )


# ── Token validation ──────────────────────────────────────────────────────────

def decode_token(token: str, expected_type: TokenType = TokenType.ACCESS) -> dict[str, Any]:
    """
    Decode and validate a JWT token.

    Args:
        token:         The raw JWT string from the Authorization header.
        expected_type: "access" or "refresh" — raises if type doesn't match.

    Returns:
        The decoded payload dict.

    Raises:
        ValueError: If the token is expired, malformed, or the wrong type.
                    (Callers map this to a friendly auth error, not a 401 with tech text.)
    """
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        # Convert all Jose errors to a single, non-leaky ValueError
        # The caller decides what message to show the user
        raise ValueError(f"Token invalid: {exc}") from exc

    token_type = payload.get("type")
    if token_type != expected_type.value:
        raise ValueError(
            f"Expected {expected_type.value} token but got {token_type!r}."
        )

    return payload
