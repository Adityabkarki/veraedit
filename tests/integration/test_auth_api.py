"""
ViraEdit — EP-1.2 integration tests for the auth API.

Tests exercise the full request/response cycle using FastAPI's TestClient
against a real PostgreSQL database (Docker must be running).

Tests:
    - POST /api/v1/auth/register → creates user, returns tokens
    - POST /api/v1/auth/login    → returns tokens for valid credentials
    - POST /api/v1/auth/refresh  → swaps refresh token for new pair
    - POST /api/v1/auth/logout   → blacklists refresh token
    - GET  /api/v1/auth/me       → returns user profile

Run: pytest tests/integration/test_auth_api.py -v
Requires: Docker services up (postgres, redis)
"""
import sys
import os
import uuid

# Add apps/api to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

import pytest


# ── Helpers ───────────────────────────────────────────────────────────────────

def _unique_email() -> str:
    """Generate a unique test email to avoid conflicts between test runs.
    Uses @example.com — an IANA-reserved domain that email-validator accepts.
    """
    return f"test_{uuid.uuid4().hex[:8]}@example.com"


# ── Register ──────────────────────────────────────────────────────────────────

class TestRegister:
    def test_register_success(self, client):
        """POST /register creates user and returns access + refresh tokens."""
        email = _unique_email()
        response = client.post("/api/v1/auth/register", json={
            "email": email,
            "username": f"creator_{uuid.uuid4().hex[:6]}",
            "password": "Str0ngPassword!",
        })
        assert response.status_code == 201, response.text
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == email
        assert data["user"]["is_active"] is True

    def test_register_returns_x_request_id_header(self, client):
        """Every response includes X-Request-ID."""
        response = client.post("/api/v1/auth/register", json={
            "email": _unique_email(),
            "username": f"creator_{uuid.uuid4().hex[:6]}",
            "password": "Str0ngPassword!",
        })
        assert "x-request-id" in response.headers

    def test_register_duplicate_email_returns_409(self, client):
        """Registering with an already-used email returns 409, not 500."""
        email = _unique_email()
        payload = {
            "email": email,
            "username": f"creator_{uuid.uuid4().hex[:6]}",
            "password": "Str0ngPassword!",
        }
        client.post("/api/v1/auth/register", json=payload)

        # Second registration with same email
        payload["username"] = f"creator_{uuid.uuid4().hex[:6]}"  # different username
        response = client.post("/api/v1/auth/register", json=payload)
        assert response.status_code == 409
        data = response.json()
        assert "error" in data
        assert email in data["message"]  # friendly message names the email

    def test_register_invalid_email_returns_422(self, client):
        """Bad email format returns 422 validation error."""
        response = client.post("/api/v1/auth/register", json={
            "email": "not-an-email",
            "username": "creator",
            "password": "Str0ngPassword!",
        })
        assert response.status_code == 422
        data = response.json()
        assert data["error"] == "VALIDATION_ERROR"

    def test_register_short_password_returns_422(self, client):
        """Password shorter than 8 chars returns 422."""
        response = client.post("/api/v1/auth/register", json={
            "email": _unique_email(),
            "username": "creator",
            "password": "short",
        })
        assert response.status_code == 422

    def test_register_common_password_returns_422(self, client):
        """Common passwords are rejected."""
        response = client.post("/api/v1/auth/register", json={
            "email": _unique_email(),
            "username": "creator",
            "password": "password",
        })
        assert response.status_code == 422


# ── Login ─────────────────────────────────────────────────────────────────────

class TestLogin:
    @pytest.fixture(autouse=True)
    def registered_user(self, client):
        """Register a fresh user for each login test."""
        self.email = _unique_email()
        self.password = "Str0ngPassword!"
        self.username = f"creator_{uuid.uuid4().hex[:6]}"
        client.post("/api/v1/auth/register", json={
            "email": self.email,
            "username": self.username,
            "password": self.password,
        })

    def test_login_success(self, client):
        """POST /login returns access + refresh tokens."""
        response = client.post("/api/v1/auth/login", json={
            "email": self.email,
            "password": self.password,
        })
        assert response.status_code == 200, response.text
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password_returns_401(self, client):
        """Wrong password returns 401 with friendly message."""
        response = client.post("/api/v1/auth/login", json={
            "email": self.email,
            "password": "WrongPassword!",
        })
        assert response.status_code == 401
        data = response.json()
        assert "error" in data
        # No "401 Unauthorized" or JWT jargon in the message
        assert "401" not in data["message"]
        assert "Unauthorized" not in data["message"]
        assert "password" in data["message"].lower()

    def test_login_nonexistent_email_returns_401(self, client):
        """Unknown email returns 401 (not 404 — prevents user enumeration).
        Uses a valid-format email that simply doesn't exist in the DB.
        """
        response = client.post("/api/v1/auth/login", json={
            "email": f"ghost_{uuid.uuid4().hex[:8]}@example.com",
            "password": "SomePassword!",
        })
        # Should be 401 (same as wrong password — don't reveal whether email exists)
        assert response.status_code == 401

    def test_login_missing_password_returns_422(self, client):
        """Missing required field returns 422."""
        response = client.post("/api/v1/auth/login", json={"email": self.email})
        assert response.status_code == 422


# ── /me endpoint ──────────────────────────────────────────────────────────────

class TestMe:
    @pytest.fixture(autouse=True)
    def auth_tokens(self, client):
        """Register + login to get tokens."""
        self.email = _unique_email()
        self.password = "Str0ngPassword!"
        reg = client.post("/api/v1/auth/register", json={
            "email": self.email,
            "username": f"creator_{uuid.uuid4().hex[:6]}",
            "password": self.password,
        })
        assert reg.status_code == 201, reg.text
        tokens = reg.json()
        self.access_token = tokens["access_token"]
        self.refresh_token = tokens["refresh_token"]

    def test_me_with_valid_token(self, client):
        """GET /me returns user profile."""
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {self.access_token}"},
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["email"] == self.email
        assert "id" in data
        assert "password_hash" not in data  # never leak this

    def test_me_without_token_returns_401(self, client):
        """GET /me with no token returns 401."""
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 401
        data = response.json()
        assert "sign in" in data["message"].lower() or "logged in" in data["message"].lower()

    def test_me_with_invalid_token_returns_401(self, client):
        """GET /me with garbage token returns 401."""
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer not.a.real.token"},
        )
        assert response.status_code == 401

    def test_me_with_refresh_token_returns_401(self, client):
        """Using a refresh token instead of access token for /me returns 401."""
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {self.refresh_token}"},
        )
        assert response.status_code == 401


# ── Refresh ───────────────────────────────────────────────────────────────────

class TestRefresh:
    @pytest.fixture(autouse=True)
    def auth_tokens(self, client):
        self.email = _unique_email()
        reg = client.post("/api/v1/auth/register", json={
            "email": self.email,
            "username": f"creator_{uuid.uuid4().hex[:6]}",
            "password": "Str0ngPassword!",
        })
        assert reg.status_code == 201
        tokens = reg.json()
        self.access_token = tokens["access_token"]
        self.refresh_token = tokens["refresh_token"]

    def test_refresh_returns_new_tokens(self, client):
        """POST /refresh returns a new access + refresh pair."""
        response = client.post("/api/v1/auth/refresh", json={
            "refresh_token": self.refresh_token,
        })
        assert response.status_code == 200, response.text
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        # New tokens should be different from the old ones
        assert data["access_token"] != self.access_token
        assert data["refresh_token"] != self.refresh_token

    def test_refresh_with_access_token_fails(self, client):
        """Trying to refresh with an access token returns 401."""
        response = client.post("/api/v1/auth/refresh", json={
            "refresh_token": self.access_token,  # wrong token type
        })
        assert response.status_code == 401

    def test_refresh_with_garbage_fails(self, client):
        """Garbage token returns 401."""
        response = client.post("/api/v1/auth/refresh", json={
            "refresh_token": "not.a.token",
        })
        assert response.status_code == 401


# ── Logout ────────────────────────────────────────────────────────────────────

class TestLogout:
    @pytest.fixture(autouse=True)
    def auth_tokens(self, client):
        self.email = _unique_email()
        reg = client.post("/api/v1/auth/register", json={
            "email": self.email,
            "username": f"creator_{uuid.uuid4().hex[:6]}",
            "password": "Str0ngPassword!",
        })
        assert reg.status_code == 201
        tokens = reg.json()
        self.access_token = tokens["access_token"]
        self.refresh_token = tokens["refresh_token"]

    def test_logout_success(self, client):
        """POST /logout returns 200 with friendly message."""
        response = client.post("/api/v1/auth/logout", json={
            "refresh_token": self.refresh_token,
        })
        assert response.status_code == 200, response.text
        data = response.json()
        assert "signed out" in data["message"].lower() or "sign" in data["message"].lower()

    def test_logout_with_expired_token_is_ok(self, client):
        """Logging out with an already-expired/invalid token returns 200 — idempotent."""
        response = client.post("/api/v1/auth/logout", json={
            "refresh_token": "already.expired.token",
        })
        # Should succeed silently — no error for already-logged-out sessions
        assert response.status_code == 200
