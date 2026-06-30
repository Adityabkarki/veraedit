"""
Integration tests for AI spend API (Phase 07).
"""
import os
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


@pytest.fixture(scope="module")
def auth_headers(client):
    email = f"ai_spend_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "username": f"ai_spend_{uuid.uuid4().hex[:6]}",
            "password": "Str0ngPassword!",
        },
    )
    assert reg.status_code == 201, reg.text
    return {"Authorization": f"Bearer {reg.json()['access_token']}"}


def _make_project(client, headers) -> tuple[str, str]:
    resp = client.post(
        "/api/v1/projects",
        json={"name": "AI Spend Test", "content_type": "shorts"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    project_id = resp.json()["id"]
    user_resp = client.get("/api/v1/auth/me", headers=headers)
    user_id = user_resp.json()["id"]
    return project_id, user_id


class TestAISpendAPI:
    def test_project_spend_requires_auth(self, client):
        resp = client.get(f"/api/v1/ai-spend/project/{uuid.uuid4()}")
        assert resp.status_code == 401

    def test_project_spend_empty_project(self, client, auth_headers):
        project_id, _ = _make_project(client, auth_headers)
        resp = client.get(
            f"/api/v1/ai-spend/project/{project_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total_usd"] == 0.0
        assert body["call_count"] == 0

    def test_workspace_spend_for_current_user(self, client, auth_headers):
        _, user_id = _make_project(client, auth_headers)
        resp = client.get(
            f"/api/v1/ai-spend/workspace/{user_id}?period_days=30",
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["workspace_id"] == user_id

    def test_workspace_spend_rejects_other_user(self, client, auth_headers):
        resp = client.get(
            f"/api/v1/ai-spend/workspace/{uuid.uuid4()}?period_days=30",
            headers=auth_headers,
        )
        assert resp.status_code == 404
