"""
Integration tests for template render API (Phase 06).
"""
import os
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


@pytest.fixture(scope="module")
def auth_headers(client):
    email = f"render_tpl_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "username": f"render_tpl_{uuid.uuid4().hex[:6]}",
            "password": "Str0ngPassword!",
        },
    )
    assert reg.status_code == 201, reg.text
    return {"Authorization": f"Bearer {reg.json()['access_token']}"}


def _make_project(client, headers) -> str:
    resp = client.post(
        "/api/v1/projects",
        json={"name": "Template Render Test", "content_type": "shorts"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


MINIMAL_TEMPLATE = {
    "template_id": "test-template",
    "slots": [
        {
            "slot_id": "slot_1",
            "type": "video_placeholder",
            "label": "Hook",
            "start": 0.0,
            "end": 3.0,
        }
    ],
}


class TestTemplateRenderAPI:
    def test_render_requires_auth(self, client):
        resp = client.post(
            "/api/v1/render/from-template",
            json={
                "template": MINIMAL_TEMPLATE,
                "resolved_assets": {"slot_1": {"storage_key": "library/x.mp4"}},
                "project_id": str(uuid.uuid4()),
            },
        )
        assert resp.status_code == 401

    def test_render_queues_job(self, client, auth_headers, monkeypatch):
        from tasks import render_from_template_task

        monkeypatch.setattr(
            render_from_template_task.render_from_template_task,
            "delay",
            lambda *a, **k: None,
        )

        project_id = _make_project(client, auth_headers)
        resp = client.post(
            "/api/v1/render/from-template",
            json={
                "template": MINIMAL_TEMPLATE,
                "resolved_assets": {"slot_1": {"storage_key": "library/x.mp4"}},
                "text_values": {},
                "project_id": project_id,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 202, resp.text
        assert "job_id" in resp.json()

    def test_get_job_not_found(self, client, auth_headers):
        resp = client.get(
            f"/api/v1/render/jobs/{uuid.uuid4()}",
            headers=auth_headers,
        )
        assert resp.status_code == 404
