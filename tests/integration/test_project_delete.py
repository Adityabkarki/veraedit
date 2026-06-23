"""Integration test — project delete purges storage (mocked)."""
import sys
import os
import uuid
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


@pytest.fixture(scope="module")
def auth_headers(client):
    email = f"del_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post("/api/v1/auth/register", json={
        "email": email,
        "username": f"del_{uuid.uuid4().hex[:6]}",
        "password": "Str0ngPassword!",
    })
    assert reg.status_code == 201
    return {"Authorization": f"Bearer {reg.json()['access_token']}"}


class TestProjectHardDelete:
    def test_delete_project_calls_storage_purge(self, client, auth_headers):
        proj = client.post(
            "/api/v1/projects",
            json={"name": "Delete me", "content_type": "vlog"},
            headers=auth_headers,
        )
        assert proj.status_code == 201
        pid = proj.json()["id"]

        with patch(
            "routers.projects.purge_project_storage",
            new_callable=AsyncMock,
        ) as mock_purge:
            mock_purge.return_value = {"media_objects_deleted": 0}
            resp = client.delete(f"/api/v1/projects/{pid}", headers=auth_headers)

        assert resp.status_code == 204
        mock_purge.assert_called_once()

        get_resp = client.get(f"/api/v1/projects/{pid}", headers=auth_headers)
        assert get_resp.status_code == 404
