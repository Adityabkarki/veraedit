"""Integration test — retranscribe endpoint."""
import uuid

import pytest


@pytest.fixture(scope="module")
def auth_headers(client):
    email = f"rt_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post("/api/v1/auth/register", json={
        "email": email,
        "username": f"rt_{uuid.uuid4().hex[:6]}",
        "password": "Str0ngPassword!",
    })
    assert reg.status_code == 201
    return {"Authorization": f"Bearer {reg.json()['access_token']}"}


class TestRetranscribe:
    def test_retranscribe_requires_existing_asset(self, client, auth_headers):
        proj = client.post(
            "/api/v1/projects",
            json={"name": "Retranscribe test", "content_type": "podcast"},
            headers=auth_headers,
        )
        pid = proj.json()["id"]
        fake_asset = str(uuid.uuid4())
        resp = client.post(
            f"/api/v1/projects/{pid}/assets/{fake_asset}/retranscribe",
            headers=auth_headers,
        )
        assert resp.status_code == 404
