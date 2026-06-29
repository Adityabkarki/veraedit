"""
ViraEdit — Integration tests for video ingestion API (Module 01).

Run: pytest tests/integration/test_ingest_api.py -v
Requires: Docker services (postgres, redis, minio)
"""
import io
import os
import sys
import uuid
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

import pytest


@pytest.fixture(scope="module")
def auth_headers(client):
    email = f"ingest_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "username": f"ingest_{uuid.uuid4().hex[:6]}",
            "password": "Str0ngPassword!",
        },
    )
    assert reg.status_code == 201, reg.text
    return {"Authorization": f"Bearer {reg.json()['access_token']}"}


def _create_project(client, headers) -> str:
    resp = client.post(
        "/api/v1/projects",
        json={"name": "Ingest Test", "content_type": "podcast"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


class TestIngestAPI:
    def test_ingest_url_queues_job(self, client, auth_headers):
        project_id = _create_project(client, auth_headers)
        with patch("routers.ingest.ingest_url_task.delay") as mock_delay:
            resp = client.post(
                "/api/v1/ingest/url",
                json={
                    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    "project_id": project_id,
                },
                headers=auth_headers,
            )
        assert resp.status_code == 202, resp.text
        data = resp.json()
        assert data["status"] == "queued"
        assert "job_id" in data
        mock_delay.assert_called_once()

    def test_ingest_upload_queues_job(self, client, auth_headers):
        project_id = _create_project(client, auth_headers)
        fake_video = io.BytesIO(b"\x00" * 1024)
        with patch("routers.ingest.process_uploaded_file_task.delay"):
            resp = client.post(
                "/api/v1/ingest/upload",
                data={"project_id": project_id},
                files={"file": ("clip.mp4", fake_video, "video/mp4")},
                headers=auth_headers,
            )
        assert resp.status_code == 202, resp.text
        assert resp.json()["status"] == "queued"

    def test_get_job_requires_auth(self, client):
        resp = client.get(f"/api/v1/ingest/jobs/{uuid.uuid4()}")
        assert resp.status_code == 401

    def test_get_job_not_found(self, client, auth_headers):
        resp = client.get(
            f"/api/v1/ingest/jobs/{uuid.uuid4()}",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_ingest_url_requires_auth(self, client):
        resp = client.post(
            "/api/v1/ingest/url",
            json={"url": "https://youtu.be/abc", "project_id": str(uuid.uuid4())},
        )
        assert resp.status_code == 401
