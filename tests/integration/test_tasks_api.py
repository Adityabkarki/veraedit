"""Tests for Celery task status API."""
import uuid
from unittest.mock import MagicMock, patch

import pytest


class TestTaskStatusEndpoint:
    def test_get_task_status_success(self, client):
        email = f"task_{uuid.uuid4().hex[:8]}@example.com"
        reg = client.post("/api/v1/auth/register", json={
            "email": email,
            "username": f"t_{uuid.uuid4().hex[:6]}",
            "password": "Str0ngPassword!",
        })
        headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
        task_id = str(uuid.uuid4())

        mock_result = MagicMock()
        mock_result.state = "SUCCESS"
        mock_result.result = {"status": "complete", "preset_id": "abc"}

        with patch("routers.tasks.AsyncResult", return_value=mock_result):
            resp = client.get(f"/api/v1/tasks/{task_id}", headers=headers)

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "success"
        assert body["result"]["preset_id"] == "abc"

    def test_get_task_status_failed_result(self, client):
        email = f"task_{uuid.uuid4().hex[:8]}@example.com"
        reg = client.post("/api/v1/auth/register", json={
            "email": email,
            "username": f"t_{uuid.uuid4().hex[:6]}",
            "password": "Str0ngPassword!",
        })
        headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
        task_id = str(uuid.uuid4())

        mock_result = MagicMock()
        mock_result.state = "SUCCESS"
        mock_result.result = {
            "status": "failed",
            "error": "Video is 69 minutes long. Style analysis supports videos up to 30 minutes.",
        }

        with patch("routers.tasks.AsyncResult", return_value=mock_result):
            resp = client.get(f"/api/v1/tasks/{task_id}", headers=headers)

        assert resp.status_code == 200
        assert resp.json()["status"] == "failure"
        assert "69 minutes" in resp.json()["error"]

    def test_offline_task_id_returns_503(self, client):
        email = f"task_{uuid.uuid4().hex[:8]}@example.com"
        reg = client.post("/api/v1/auth/register", json={
            "email": email,
            "username": f"t_{uuid.uuid4().hex[:6]}",
            "password": "Str0ngPassword!",
        })
        headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

        resp = client.get(f"/api/v1/tasks/offline-{uuid.uuid4()}", headers=headers)
        assert resp.status_code == 503

    def test_task_status_requires_auth(self, client):
        resp = client.get(f"/api/v1/tasks/{uuid.uuid4()}")
        assert resp.status_code == 401
