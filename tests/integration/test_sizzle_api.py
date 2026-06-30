"""
Integration tests for sizzle reel API (Phase 05).

Run: pytest tests/integration/test_sizzle_api.py -v
"""
import os
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


@pytest.fixture(scope="module")
def auth_headers(client):
    email = f"sizzle_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "username": f"sizzle_{uuid.uuid4().hex[:6]}",
            "password": "Str0ngPassword!",
        },
    )
    assert reg.status_code == 201, reg.text
    return {"Authorization": f"Bearer {reg.json()['access_token']}"}


def _make_project(client, headers) -> str:
    resp = client.post(
        "/api/v1/projects",
        json={"name": "Sizzle Test", "content_type": "podcast"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


class TestSizzleAPI:
    def test_generate_requires_auth(self, client):
        resp = client.post(
            "/api/v1/sizzle/generate",
            json={
                "video_key": "projects/x/raw/y.mp4",
                "project_id": str(uuid.uuid4()),
            },
        )
        assert resp.status_code == 401

    def test_generate_invalid_mood(self, client, auth_headers):
        project_id = _make_project(client, auth_headers)
        resp = client.post(
            "/api/v1/sizzle/generate",
            json={
                "video_key": "projects/test/raw/ref.mp4",
                "project_id": project_id,
                "music_mood": "jazz_fusion",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 422

    def test_generate_queues_job(self, client, auth_headers, monkeypatch):
        from tasks import sizzle_tasks

        monkeypatch.setattr(sizzle_tasks.generate_sizzle_task, "delay", lambda *a, **k: None)

        project_id = _make_project(client, auth_headers)
        resp = client.post(
            "/api/v1/sizzle/generate",
            json={
                "video_key": "projects/test/raw/ref.mp4",
                "project_id": project_id,
                "target_duration": 30,
                "music_mood": "dramatic",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 202, resp.text
        assert "job_id" in resp.json()

    def test_get_job_not_found(self, client, auth_headers):
        resp = client.get(
            f"/api/v1/sizzle/jobs/{uuid.uuid4()}",
            headers=auth_headers,
        )
        assert resp.status_code == 404
