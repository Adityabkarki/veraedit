"""
Integration tests for WebSocket server (EP-6.1).

Requires running Postgres + Redis (same as other integration tests).
"""
import sys
import os
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

import pytest


@pytest.fixture
def auth_headers(client):
    email = f"ws_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post("/api/v1/auth/register", json={
        "email": email,
        "username": f"wsuser_{uuid.uuid4().hex[:6]}",
        "password": "SecurePass123!",
        "full_name": "WS Tester",
    })
    assert reg.status_code == 201, reg.text
    token = reg.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, token


@pytest.fixture
def project_id(client, auth_headers):
    headers, _ = auth_headers
    created = client.post(
        "/api/v1/projects",
        json={"name": "WS Test Project", "content_type": "podcast"},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


class TestWebSocketEndpoint:
    def test_ws_rejects_missing_token(self, client, project_id):
        with pytest.raises(Exception):
            with client.websocket_connect(f"/api/v1/ws/projects/{project_id}"):
                pass

    def test_ws_rejects_invalid_token(self, client, project_id):
        with pytest.raises(Exception):
            with client.websocket_connect(
                f"/api/v1/ws/projects/{project_id}?token=not.valid.jwt"
            ):
                pass

    def test_ws_connects_with_valid_token(self, client, project_id, auth_headers):
        _, token = auth_headers
        with client.websocket_connect(
            f"/api/v1/ws/projects/{project_id}?token={token}"
        ) as ws:
            msg = ws.receive_json()
            assert msg["type"] == "connected"
            assert msg["project_id"] == project_id
            ws.send_text("ping")
            pong = ws.receive_json()
            assert pong["type"] == "pong"

    def test_ws_rejects_other_users_project(self, client, project_id):
        other_email = f"other_{uuid.uuid4().hex[:8]}@example.com"
        reg = client.post("/api/v1/auth/register", json={
            "email": other_email,
            "username": f"other_{uuid.uuid4().hex[:6]}",
            "password": "SecurePass123!",
            "full_name": "Other User",
        })
        token = reg.json()["access_token"]
        with pytest.raises(Exception):
            with client.websocket_connect(
                f"/api/v1/ws/projects/{project_id}?token={token}"
            ):
                pass

    def test_manager_broadcast_delivers_to_client(self, client, project_id, auth_headers):
        """In-process broadcast reaches connected WebSocket."""
        import asyncio
        from ws.events import build_pipeline_event, PipelineStage
        from ws.manager import ws_manager

        _, token = auth_headers
        with client.websocket_connect(
            f"/api/v1/ws/projects/{project_id}?token={token}"
        ) as ws:
            connected = ws.receive_json()
            assert connected["type"] == "connected"

            event = build_pipeline_event(
                project_id,
                "asset-test",
                stage=PipelineStage.TRANSCRIPTION.value,
                asset_status="transcribing",
                progress_percent=25,
            )

            asyncio.run(ws_manager.broadcast(project_id, event))

            received = ws.receive_json()
            assert received["type"] == "pipeline.progress"
            assert received["data"]["progress_percent"] == 25
