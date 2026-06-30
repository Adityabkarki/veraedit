"""
Integration tests for platform shorts API (Phase 03).

Run: pytest tests/integration/test_platform_shorts_api.py -v
"""
import os
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


@pytest.fixture(scope="module")
def auth_headers(client):
    email = f"pshorts_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "username": f"pshorts_{uuid.uuid4().hex[:6]}",
            "password": "Str0ngPassword!",
        },
    )
    assert reg.status_code == 201, reg.text
    return {"Authorization": f"Bearer {reg.json()['access_token']}"}


def _make_project(client, headers) -> str:
    resp = client.post(
        "/api/v1/projects",
        json={"name": "Shorts Test", "content_type": "shorts"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


class TestPlatformShortsAPI:
    def test_extract_requires_auth(self, client):
        resp = client.post(
            "/api/v1/shorts/extract",
            json={
                "video_key": "projects/x/raw/y.mp4",
                "project_id": str(uuid.uuid4()),
                "platforms": ["tiktok"],
            },
        )
        assert resp.status_code == 401

    def test_extract_requires_valid_platform(self, client, auth_headers):
        project_id = _make_project(client, auth_headers)
        resp = client.post(
            "/api/v1/shorts/extract",
            json={
                "video_key": "projects/test/raw/ref.mp4",
                "project_id": project_id,
                "platforms": ["invalid_platform"],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 422

    def test_extract_queues_job(self, client, auth_headers, monkeypatch):
        from tasks import shorts_tasks

        monkeypatch.setattr(shorts_tasks.extract_shorts_task, "delay", lambda *a, **k: None)

        project_id = _make_project(client, auth_headers)
        resp = client.post(
            "/api/v1/shorts/extract",
            json={
                "video_key": "projects/test/raw/ref.mp4",
                "project_id": project_id,
                "platforms": ["tiktok", "instagram_reels"],
                "max_clips": 3,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 202, resp.text
        assert "job_id" in resp.json()

    def test_get_job_not_found(self, client, auth_headers):
        resp = client.get(
            f"/api/v1/shorts/jobs/{uuid.uuid4()}",
            headers=auth_headers,
        )
        assert resp.status_code == 404
