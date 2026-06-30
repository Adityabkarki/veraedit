"""
Integration tests for style intelligence API (Phase 01).

Run: pytest tests/integration/test_style_intelligence_api.py -v
Requires: Docker services up (postgres, redis, minio)
"""
import os
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


@pytest.fixture(scope="module")
def auth_headers(client):
    email = f"style_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "username": f"styleuser_{uuid.uuid4().hex[:6]}",
            "password": "Str0ngPassword!",
        },
    )
    assert reg.status_code == 201, reg.text
    return {"Authorization": f"Bearer {reg.json()['access_token']}"}


def _make_project(client, headers) -> str:
    resp = client.post(
        "/api/v1/projects",
        json={"name": "Style Test", "content_type": "shorts"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


class TestStyleIntelligenceAPI:
    def test_analyze_requires_auth(self, client):
        resp = client.post(
            "/api/v1/style-intelligence/analyze",
            json={"project_id": str(uuid.uuid4()), "video_key": "projects/x/raw/y.mp4"},
        )
        assert resp.status_code == 401

    def test_analyze_requires_input(self, client, auth_headers):
        project_id = _make_project(client, auth_headers)
        resp = client.post(
            "/api/v1/style-intelligence/analyze",
            json={"project_id": project_id},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    def test_analyze_video_key_queues_job(self, client, auth_headers, monkeypatch):
        from tasks import style_tasks

        def fake_delay(*args, **kwargs):
            return None

        monkeypatch.setattr(style_tasks.analyze_style_task, "delay", fake_delay)

        project_id = _make_project(client, auth_headers)
        resp = client.post(
            "/api/v1/style-intelligence/analyze",
            json={
                "project_id": project_id,
                "video_key": "projects/test/raw/ref.mp4",
                "name": "My template",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 202, resp.text
        assert "job_id" in resp.json()

    def test_get_job_not_found(self, client, auth_headers):
        resp = client.get(
            f"/api/v1/style-intelligence/jobs/{uuid.uuid4()}",
            headers=auth_headers,
        )
        assert resp.status_code == 404
