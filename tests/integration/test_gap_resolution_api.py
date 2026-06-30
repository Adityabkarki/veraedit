"""
Integration tests for gap resolution API (Phase 02).

Run: pytest tests/integration/test_gap_resolution_api.py -v
"""
import os
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


@pytest.fixture(scope="module")
def auth_headers(client):
    email = f"gap_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "username": f"gapuser_{uuid.uuid4().hex[:6]}",
            "password": "Str0ngPassword!",
        },
    )
    assert reg.status_code == 201, reg.text
    return {"Authorization": f"Bearer {reg.json()['access_token']}"}


SAMPLE_TEMPLATE = {
    "version": "2.0",
    "duration": 10,
    "aspect_ratio": "9:16",
    "pacing": "fast",
    "visual_style": "ugc",
    "color_palette": ["#111111"],
    "caption_style": {},
    "slots": [
        {
            "slot_id": "clip_1",
            "type": "video_placeholder",
            "start": 0,
            "end": 4,
            "label": "Hook",
            "requirement": {
                "shot_type": "talking_head",
                "energy_level": "high_energy",
                "min_duration": 3,
                "max_duration": 5,
                "needs_face": True,
                "description": "Energetic hook clip",
            },
        }
    ],
    "transitions": [],
}


class TestGapResolutionAPI:
    def test_match_requires_auth(self, client):
        resp = client.post("/api/v1/gap-resolution/match", json={"template": SAMPLE_TEMPLATE})
        assert resp.status_code == 401

    def test_match_empty_library_marks_missing(self, client, auth_headers):
        resp = client.post(
            "/api/v1/gap-resolution/match",
            json={"template": SAMPLE_TEMPLATE},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["slots"][0]["match"]["status"] == "missing"

    def test_generate_slot_image(self, client, auth_headers, monkeypatch):
        from processors import gap_generator

        async def fake_image(desc, brand, aspect="9:16"):
            return b"\x89PNG\r\n\x1a\n"

        monkeypatch.setattr(gap_generator, "generate_missing_image", fake_image)

        resp = client.post(
            "/api/v1/gap-resolution/generate-slot",
            json={
                "slot_type": "image_placeholder",
                "requirement_description": "Bold product shot on white background",
                "aspect_ratio": "9:16",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["type"] == "image"
        assert data["is_generated_standin"] is True
        assert data["source"] == "ai_generated"
