"""
ViraEdit — EP-1.2 unit tests for authentication utilities.

Tests:
    - bcrypt: hash is never the same as plain text, verify works
    - JWT: access token created with correct claims, rejects expired/wrong-type
    - Token rotation: refresh token has 7-day lifetime
    - Friendly error messages: no "401 Unauthorized" tech-speak

Run: pytest tests/unit/test_auth.py -v
"""
import sys
import os

# Add apps/api to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

import time
import pytest


# ── Password hashing ──────────────────────────────────────────────────────────

class TestPasswordHashing:
    def test_hash_is_not_plain_text(self):
        from auth.password import hash_password
        hashed = hash_password("MyS3cretP@ss")
        assert hashed != "MyS3cretP@ss"

    def test_hash_starts_with_bcrypt_prefix(self):
        from auth.password import hash_password
        hashed = hash_password("TestPass123")
        assert hashed.startswith("$2b$") or hashed.startswith("$2a$")

    def test_two_hashes_of_same_password_differ(self):
        """bcrypt uses random salt — same password produces different hashes."""
        from auth.password import hash_password
        h1 = hash_password("SamePass99")
        h2 = hash_password("SamePass99")
        assert h1 != h2

    def test_verify_correct_password(self):
        from auth.password import hash_password, verify_password
        hashed = hash_password("CorrectHorse")
        assert verify_password("CorrectHorse", hashed) is True

    def test_verify_wrong_password_returns_false(self):
        from auth.password import hash_password, verify_password
        hashed = hash_password("CorrectHorse")
        assert verify_password("WrongBattery", hashed) is False

    def test_verify_empty_password_returns_false(self):
        from auth.password import hash_password, verify_password
        hashed = hash_password("SolidPassword")
        assert verify_password("", hashed) is False


# ── JWT token creation ────────────────────────────────────────────────────────

class TestJWTCreation:
    def test_access_token_is_string(self):
        from auth.jwt import create_access_token
        token, jti = create_access_token("user-123", "test@example.com")
        assert isinstance(token, str)
        assert len(token) > 20

    def test_access_token_returns_jti(self):
        from auth.jwt import create_access_token
        token, jti = create_access_token("user-123", "test@example.com")
        assert isinstance(jti, str)
        assert len(jti) == 32  # UUID hex

    def test_refresh_token_is_string(self):
        from auth.jwt import create_refresh_token
        token, jti = create_refresh_token("user-123", "test@example.com")
        assert isinstance(token, str)
        assert len(token) > 20

    def test_two_tokens_have_different_jtis(self):
        from auth.jwt import create_access_token
        _, jti1 = create_access_token("user-123", "test@example.com")
        _, jti2 = create_access_token("user-123", "test@example.com")
        assert jti1 != jti2


# ── JWT token decoding ────────────────────────────────────────────────────────

class TestJWTDecoding:
    def test_decode_valid_access_token(self):
        from auth.jwt import TokenType, create_access_token, decode_token
        token, _ = create_access_token("user-abc", "creator@example.com")
        payload = decode_token(token, TokenType.ACCESS)
        assert payload["sub"] == "user-abc"
        assert payload["email"] == "creator@example.com"
        assert payload["type"] == "access"

    def test_decode_valid_refresh_token(self):
        from auth.jwt import TokenType, create_refresh_token, decode_token
        token, _ = create_refresh_token("user-abc", "creator@example.com")
        payload = decode_token(token, TokenType.REFRESH)
        assert payload["sub"] == "user-abc"
        assert payload["type"] == "refresh"

    def test_access_token_rejected_as_refresh(self):
        """Using an access token where refresh is expected should raise ValueError."""
        from auth.jwt import TokenType, create_access_token, decode_token
        token, _ = create_access_token("user-abc", "creator@example.com")
        with pytest.raises(ValueError, match="refresh"):
            decode_token(token, TokenType.REFRESH)

    def test_refresh_token_rejected_as_access(self):
        """Using a refresh token where access is expected should raise ValueError."""
        from auth.jwt import TokenType, create_refresh_token, decode_token
        token, _ = create_refresh_token("user-abc", "creator@example.com")
        with pytest.raises(ValueError, match="access"):
            decode_token(token, TokenType.ACCESS)

    def test_tampered_token_raises_value_error(self):
        from auth.jwt import TokenType, create_access_token, decode_token
        token, _ = create_access_token("user-abc", "creator@example.com")
        tampered = token[:-5] + "XXXXX"  # corrupt the signature
        with pytest.raises(ValueError):
            decode_token(tampered, TokenType.ACCESS)

    def test_garbage_string_raises_value_error(self):
        from auth.jwt import TokenType, decode_token
        with pytest.raises(ValueError):
            decode_token("not.a.jwt.token", TokenType.ACCESS)

    def test_payload_contains_jti(self):
        from auth.jwt import TokenType, create_access_token, decode_token
        token, jti = create_access_token("user-abc", "creator@example.com")
        payload = decode_token(token, TokenType.ACCESS)
        assert payload["jti"] == jti


# ── Token lifetime constants ──────────────────────────────────────────────────

class TestTokenLifetimes:
    def test_access_token_expires_in_15_minutes(self):
        from auth.jwt import ACCESS_TOKEN_EXPIRE_MINUTES
        assert ACCESS_TOKEN_EXPIRE_MINUTES == 15

    def test_refresh_token_expires_in_7_days(self):
        from auth.jwt import REFRESH_TOKEN_EXPIRE_DAYS
        assert REFRESH_TOKEN_EXPIRE_DAYS == 7


# ── Auth error messages ───────────────────────────────────────────────────────

class TestAuthErrorMessages:
    def test_not_authenticated_message_is_friendly(self):
        from exceptions import NotAuthenticatedError
        err = NotAuthenticatedError()
        assert "401" not in err.message
        assert "Unauthorized" not in err.message
        assert "sign in" in err.message.lower() or "logged in" in err.message.lower()

    def test_not_authenticated_custom_message(self):
        from exceptions import NotAuthenticatedError
        err = NotAuthenticatedError(message="Your session has expired. Please sign in again.")
        assert "expired" in err.message

    def test_wrong_password_message_is_friendly(self):
        from exceptions import WrongPasswordError
        err = WrongPasswordError()
        assert "401" not in err.message
        assert "Unauthorized" not in err.message
        assert "password" in err.message.lower()
        assert err.status_code == 401

    def test_duplicate_email_message_is_actionable(self):
        from exceptions import DuplicateEmailError
        err = DuplicateEmailError(email="test@example.com")
        assert "test@example.com" in err.message
        assert err.status_code == 409

    def test_invalid_token_error_code(self):
        from exceptions import InvalidTokenError
        err = InvalidTokenError()
        assert err.error_code == "INVALID_TOKEN"
        assert err.status_code == 401


# ── Auth schemas ──────────────────────────────────────────────────────────────

class TestAuthSchemas:
    def test_register_validates_email(self):
        from pydantic import ValidationError
        from schemas.auth import RegisterRequest
        with pytest.raises(ValidationError):
            RegisterRequest(email="not-an-email", username="creator", password="Pass1234!")

    def test_register_validates_password_length(self):
        from pydantic import ValidationError
        from schemas.auth import RegisterRequest
        with pytest.raises(ValidationError):
            RegisterRequest(email="a@b.com", username="creator", password="short")

    def test_register_rejects_common_password(self):
        from pydantic import ValidationError
        from schemas.auth import RegisterRequest
        with pytest.raises(ValidationError, match="common"):
            RegisterRequest(email="a@b.com", username="creator", password="password")

    def test_register_lowercases_username(self):
        from schemas.auth import RegisterRequest
        req = RegisterRequest(email="a@b.com", username="MyChannel", password="Str0ngPass!")
        assert req.username == "mychannel"

    def test_register_rejects_invalid_username_chars(self):
        from pydantic import ValidationError
        from schemas.auth import RegisterRequest
        with pytest.raises(ValidationError):
            RegisterRequest(email="a@b.com", username="my channel", password="Str0ngPass!")

    def test_token_response_has_correct_fields(self):
        from schemas.auth import TokenResponse
        resp = TokenResponse(access_token="abc", refresh_token="def")
        assert resp.token_type == "bearer"
        assert resp.expires_in == 900  # 15 * 60

    def test_user_response_from_orm_attributes(self):
        """UserResponse.model_validate works with ORM-like objects."""
        import uuid
        from schemas.auth import UserResponse

        class FakeUser:
            id = uuid.uuid4()
            email = "creator@example.com"
            username = "creator"
            is_active = True
            is_verified = False

        resp = UserResponse.model_validate(FakeUser())
        assert resp.email == "creator@example.com"
        assert resp.is_active is True
