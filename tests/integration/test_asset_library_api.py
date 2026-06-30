"""
Integration tests for asset library API (Phase 00).

Run: pytest tests/integration/test_asset_library_api.py -v
Requires: Docker services up (postgres, redis, minio)
"""
import os
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


@pytest.fixture(scope="module")
def auth_headers(client):
    email = f"lib_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "username": f"libuser_{uuid.uuid4().hex[:6]}",
            "password": "Str0ngPassword!",
        },
    )
    assert reg.status_code == 201, reg.text
    return {"Authorization": f"Bearer {reg.json()['access_token']}"}


class TestAssetLibraryAPI:
    def test_list_empty_library(self, client, auth_headers):
        resp = client.get("/api/v1/library", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        assert resp.json() == []

    def test_list_requires_auth(self, client):
        resp = client.get("/api/v1/library")
        assert resp.status_code == 401

    def test_upload_image(self, client, auth_headers, monkeypatch):
        async def fake_tag_image(image_path):
            return {
                "shot_type": "logo",
                "subject_count": 0,
                "has_face": False,
                "setting": "studio",
                "energy_level": "calm",
                "emotion": "neutral",
                "dominant_colors": ["#000000", "#ffffff"],
                "aspect_ratio": "1:1",
                "is_landscape_orientation": False,
                "has_text_overlay": True,
                "has_spoken_audio": False,
                "duration_seconds": None,
                "description": "Brand logo on dark background.",
                "tagging_confidence": 0.95,
            }

        import routers.asset_library as asset_library_router

        monkeypatch.setattr(asset_library_router, "tag_image_asset", fake_tag_image)

        png_bytes = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
            b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc"
            b"\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        resp = client.post(
            "/api/v1/library/upload",
            headers=auth_headers,
            files={"file": ("logo.png", png_bytes, "image/png")},
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["asset_type"] == "image"
        assert data["tags"]["shot_type"] == "logo"
        assert "storage_key" in data

        listed = client.get("/api/v1/library", headers=auth_headers)
        assert listed.status_code == 200
        assert len(listed.json()) >= 1

    def test_rejects_audio_upload(self, client, auth_headers):
        resp = client.post(
            "/api/v1/library/upload",
            headers=auth_headers,
            files={"file": ("song.mp3", b"fake", "audio/mpeg")},
        )
        assert resp.status_code in (400, 415, 422)
