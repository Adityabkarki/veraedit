"""
ViraEdit — Auth request and response schemas.

Every schema is strict about input (validators run on creation)
and explicit about output (no extra fields leak into responses).
"""
from __future__ import annotations

import re
import uuid
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


# ── Request schemas ────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    """POST /api/v1/auth/register"""

    email: EmailStr = Field(..., description="User's email address")
    username: str = Field(
        ...,
        min_length=3,
        max_length=50,
        description="Display name (3–50 characters, letters/numbers/underscores/hyphens)",
    )
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Password (minimum 8 characters)",
    )

    @field_validator("username")
    @classmethod
    def username_valid_chars(cls, v: str) -> str:
        """Allow letters, numbers, underscores, and hyphens only."""
        if not re.match(r"^[a-zA-Z0-9_\-]+$", v):
            raise ValueError(
                "Username can only contain letters, numbers, underscores, and hyphens."
            )
        return v.lower()

    @field_validator("password")
    @classmethod
    def password_not_too_simple(cls, v: str) -> str:
        """Reject passwords that are obviously weak."""
        if v.lower() in {"password", "12345678", "qwerty123", "password1"}:
            raise ValueError(
                "That password is too common. Please choose a stronger one."
            )
        return v

    model_config = {"json_schema_extra": {"example": {
        "email": "creator@example.com",
        "username": "nepali_creator",
        "password": "MyStr0ngPass!",
    }}}


class LoginRequest(BaseModel):
    """POST /api/v1/auth/login"""

    email: EmailStr = Field(..., description="Registered email address")
    password: str = Field(..., description="Account password")

    model_config = {"json_schema_extra": {"example": {
        "email": "creator@example.com",
        "password": "MyStr0ngPass!",
    }}}


class RefreshRequest(BaseModel):
    """POST /api/v1/auth/refresh"""

    refresh_token: str = Field(..., description="The refresh token from your last login")


# ── Response schemas ───────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    """Returned by /login and /refresh."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(
        description="Access token lifetime in seconds",
        default=15 * 60,  # 15 minutes
    )

    model_config = {"json_schema_extra": {"example": {
        "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "token_type": "bearer",
        "expires_in": 900,
    }}}


class UserResponse(BaseModel):
    """
    Public user profile — returned by /register and /me.
    Excludes password_hash and other private fields.
    """

    id: uuid.UUID
    email: str
    username: str
    is_active: bool
    is_verified: bool

    model_config = {
        "from_attributes": True,  # Allow construction from ORM model
        "json_schema_extra": {"example": {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "email": "creator@example.com",
            "username": "nepali_creator",
            "is_active": True,
            "is_verified": False,
        }},
    }


class RegisterResponse(BaseModel):
    """POST /api/v1/auth/register — returns user + tokens."""

    user: UserResponse
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 15 * 60


class LogoutResponse(BaseModel):
    """POST /api/v1/auth/logout"""
    message: str = "You have been signed out."


class MessageResponse(BaseModel):
    """Generic single-message response."""
    message: str
