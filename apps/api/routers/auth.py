"""
ViraEdit — Authentication router.

Endpoints:
    POST /api/v1/auth/register  → create account, return tokens
    POST /api/v1/auth/login     → verify credentials, return tokens
    POST /api/v1/auth/refresh   → exchange refresh token for new access token
    POST /api/v1/auth/logout    → blacklist refresh token in Redis
    GET  /api/v1/auth/me        → return current user profile

All errors use plain English (no "401 Unauthorized", no JWT jargon).
"""
from __future__ import annotations

import structlog
from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from auth.jwt import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    TokenType,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from auth.password import hash_password_async, verify_password_async
from database import get_db
from dependencies import DbDep
from exceptions import (
    DuplicateEmailError,
    NotAuthenticatedError,
    WrongPasswordError,
)
from models import User
from schemas.auth import (
    LoginRequest,
    LogoutResponse,
    RefreshRequest,
    RegisterRequest,
    RegisterResponse,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
log = structlog.get_logger("viraedit.auth")

# Redis key TTL = refresh token lifetime in seconds
_REFRESH_TTL_SECONDS = REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
_BLACKLIST_PREFIX = "blacklist:"


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _blacklist_token(jti: str, redis) -> None:
    """Add a token JTI to the Redis blacklist. Expires with the token."""
    if redis is not None:
        await redis.setex(f"{_BLACKLIST_PREFIX}{jti}", _REFRESH_TTL_SECONDS, "1")


async def _is_blacklisted(jti: str, redis) -> bool:
    """Return True if the token JTI has been blacklisted (i.e., logged out)."""
    if redis is None:
        return False
    result = await redis.get(f"{_BLACKLIST_PREFIX}{jti}")
    return result is not None


async def _get_redis(request: Request):
    """Pull Redis client from app state (set up in lifespan)."""
    return getattr(request.app.state, "redis", None)


# ── POST /register ────────────────────────────────────────────────────────────

@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new ViraEdit account",
    responses={
        409: {"description": "Email already registered"},
        422: {"description": "Invalid input"},
    },
)
async def register(
    body: RegisterRequest,
    db: DbDep,
    request: Request,
) -> RegisterResponse:
    """
    Create a new user account and return JWT tokens immediately.
    The user is signed in right after registering — no extra login step.
    """
    request_id = getattr(request.state, "request_id", None)

    # Check for duplicate email (fast path before hashing)
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none() is not None:
        log.info("register_duplicate_email", email=body.email)
        raise DuplicateEmailError(email=body.email)

    # Hash password — bcrypt in thread pool (non-blocking, ~0.25s per hash)
    password_hash = await hash_password_async(body.password)

    user = User(
        email=body.email,
        username=body.username,
        password_hash=password_hash,
        is_active=True,
        is_verified=False,
    )

    try:
        db.add(user)
        await db.commit()
        await db.refresh(user)
    except IntegrityError:
        await db.rollback()
        raise DuplicateEmailError(email=body.email)

    # Issue tokens
    access_token, _ = create_access_token(str(user.id), user.email)
    refresh_token, refresh_jti = create_refresh_token(str(user.id), user.email)

    # Store refresh JTI in Redis so we can invalidate on logout
    redis = await _get_redis(request)
    if redis is not None:
        # We use a SET key (not blacklist) to track valid refresh tokens
        await redis.setex(
            f"refresh:{refresh_jti}",
            _REFRESH_TTL_SECONDS,
            str(user.id),
        )

    log.info("user_registered", user_id=str(user.id), username=user.username)

    return RegisterResponse(
        user=UserResponse.model_validate(user),
        access_token=access_token,
        refresh_token=refresh_token,
    )


# ── POST /login ───────────────────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Sign in with email and password",
    responses={
        401: {"description": "Wrong email or password"},
    },
)
async def login(
    body: LoginRequest,
    db: DbDep,
    request: Request,
) -> TokenResponse:
    """
    Sign in and receive JWT access + refresh tokens.

    Returns a 401 with a friendly message for any credential problem —
    we deliberately don't say whether the email or password was wrong,
    to prevent user enumeration attacks.
    """
    # Look up user by email
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # Constant-time path: always call verify_password so timing doesn't leak existence
    # Run in thread pool so the slow bcrypt operation doesn't block the event loop
    dummy_hash = "$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    stored_hash = user.password_hash if user else dummy_hash
    password_ok = await verify_password_async(body.password, stored_hash)

    if user is None or not password_ok or not user.is_active:
        log.info("login_failed", email=body.email, reason="bad_credentials_or_inactive")
        raise WrongPasswordError()

    # Issue tokens
    access_token, _ = create_access_token(str(user.id), user.email)
    refresh_token, refresh_jti = create_refresh_token(str(user.id), user.email)

    # Register refresh token in Redis
    redis = await _get_redis(request)
    if redis is not None:
        await redis.setex(
            f"refresh:{refresh_jti}",
            _REFRESH_TTL_SECONDS,
            str(user.id),
        )

    log.info("user_logged_in", user_id=str(user.id))

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )


# ── POST /refresh ─────────────────────────────────────────────────────────────

@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Get a new access token using your refresh token",
    responses={
        401: {"description": "Refresh token expired or invalid"},
    },
)
async def refresh(
    body: RefreshRequest,
    db: DbDep,
    request: Request,
) -> TokenResponse:
    """
    Exchange a valid refresh token for a new access token.
    The old refresh token is immediately invalidated (rotation).
    """
    # Decode and validate the refresh token
    try:
        payload = decode_token(body.refresh_token, expected_type=TokenType.REFRESH)
    except ValueError:
        raise NotAuthenticatedError(
            message="Your session has expired. Please sign in again."
        )

    jti = payload.get("jti", "")
    user_id = payload.get("sub", "")

    # Check blacklist — was this token already used or logged out?
    redis = await _get_redis(request)
    if await _is_blacklisted(jti, redis):
        log.warning("refresh_token_reuse", jti=jti)
        raise NotAuthenticatedError(
            message="This session is no longer valid. Please sign in again."
        )

    # Load user
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise NotAuthenticatedError(
            message="Your account is no longer active. Please contact support."
        )

    # Invalidate old refresh token (token rotation — prevents replay attacks)
    await _blacklist_token(jti, redis)

    # Issue new token pair
    new_access, _ = create_access_token(str(user.id), user.email)
    new_refresh, new_refresh_jti = create_refresh_token(str(user.id), user.email)

    if redis is not None:
        await redis.setex(
            f"refresh:{new_refresh_jti}",
            _REFRESH_TTL_SECONDS,
            str(user.id),
        )

    log.info("tokens_refreshed", user_id=str(user.id))

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
    )


# ── POST /logout ──────────────────────────────────────────────────────────────

@router.post(
    "/logout",
    response_model=LogoutResponse,
    summary="Sign out and invalidate your refresh token",
)
async def logout(
    body: RefreshRequest,
    request: Request,
) -> LogoutResponse:
    """
    Sign out by blacklisting the refresh token.
    Access tokens expire naturally (15 min) — no server-side storage needed.
    """
    redis = await _get_redis(request)

    try:
        payload = decode_token(body.refresh_token, expected_type=TokenType.REFRESH)
        jti = payload.get("jti", "")
        if jti:
            await _blacklist_token(jti, redis)
            log.info("user_logged_out", jti=jti)
    except ValueError:
        # Already expired or invalid — treat as already logged out
        log.info("logout_invalid_token", hint="token already expired or invalid")

    return LogoutResponse(message="You have been signed out.")


# ── GET /me ───────────────────────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get your profile",
    responses={
        401: {"description": "Not signed in"},
    },
)
async def me(
    request: Request,
    db: DbDep,
) -> UserResponse:
    """
    Return the currently authenticated user's profile.
    Requires a valid Bearer token in the Authorization header.
    """
    # Extract and validate the Authorization header
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        raise NotAuthenticatedError(
            message="Please sign in to access this page."
        )

    token = authorization.removeprefix("Bearer ").strip()

    try:
        payload = decode_token(token, expected_type=TokenType.ACCESS)
    except ValueError:
        raise NotAuthenticatedError(
            message="Your session has expired. Please sign in again."
        )

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise NotAuthenticatedError(
            message="Your account was not found. Please sign in again."
        )

    return UserResponse.model_validate(user)
