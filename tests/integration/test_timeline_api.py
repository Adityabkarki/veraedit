"""
Integration tests for timeline save (PUT /timeline).

Requires Docker services (postgres on 5432 for dev, or test stack).
"""
import sys
import os
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

import pytest


@pytest.fixture(scope="module")
def auth_headers(client):
    email = f"timeline_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "username": f"tl_{uuid.uuid4().hex[:6]}",
            "password": "Str0ngPassword!",
        },
    )
    assert reg.status_code == 201, reg.text
    token = reg.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _six_track_timeline(asset_id: str) -> dict:
    return {
        "schema_version": 1,
        "tracks": [
            {
                "id": "track-video-1",
                "type": "video",
                "name": "Video",
                "clips": [
                    {
                        "id": "clip-main",
                        "asset_id": asset_id,
                        "source_start": 0,
                        "source_end": 60,
                        "timeline_start": 0,
                        "timeline_end": 60,
                    }
                ],
            },
            {"id": "track-audio-1", "type": "audio", "name": "Audio", "clips": []},
            {"id": "track-captions-1", "type": "captions", "name": "Captions", "clips": []},
            {"id": "track-overlay-1", "type": "overlay", "name": "Visuals", "clips": []},
            {"id": "track-effects-1", "type": "effects", "name": "Effects", "clips": []},
            {"id": "track-music-1", "type": "music", "name": "Music", "clips": []},
        ],
        "global_settings": {
            "resolution": "1920x1080",
            "fps": 30,
            "audio_sample_rate": 48000,
            "duration": 60,
        },
        "metadata": {},
    }


class TestTimelineSave:
    def test_put_timeline_with_effects_track(self, client, auth_headers):
        """Editor sends 6 tracks including empty effects — must not 422."""
        proj = client.post(
            "/api/v1/projects",
            json={"name": "Timeline save test", "content_type": "podcast"},
            headers=auth_headers,
        )
        assert proj.status_code == 201, proj.text
        project_id = proj.json()["id"]
        asset_id = str(uuid.uuid4())

        resp = client.put(
            f"/api/v1/projects/{project_id}/timeline",
            json={"data": _six_track_timeline(asset_id), "label": "Integration test"},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["version"] == 1
        track_types = {t["type"] for t in body["data"]["tracks"]}
        assert "effects" in track_types

    def test_get_timeline_after_save(self, client, auth_headers):
        proj = client.post(
            "/api/v1/projects",
            json={"name": "Timeline get test", "content_type": "vlog"},
            headers=auth_headers,
        )
        assert proj.status_code == 201
        project_id = proj.json()["id"]
        asset_id = str(uuid.uuid4())

        client.put(
            f"/api/v1/projects/{project_id}/timeline",
            json={"data": _six_track_timeline(asset_id), "label": "Save"},
            headers=auth_headers,
        )

        get_resp = client.get(
            f"/api/v1/projects/{project_id}/timeline",
            headers=auth_headers,
        )
        assert get_resp.status_code == 200, get_resp.text
        assert get_resp.json()["version"] >= 1
