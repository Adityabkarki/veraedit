"""
ViraEdit — EP-1.3 integration tests for projects and assets API.

Tests:
    - Project CRUD (create, list, get, update, delete)
    - Asset create → pre-signed URL returned
    - Asset confirm upload (MinIO verification)
    - Asset list, get, delete
    - Auth enforcement on all endpoints

Run: pytest tests/integration/test_projects_assets_api.py -v
Requires: Docker services up (postgres, redis, minio)
"""
import sys
import os
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

import pytest


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def auth_headers(client):
    """Register a test user and return Authorization headers."""
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post("/api/v1/auth/register", json={
        "email": email,
        "username": f"creator_{uuid.uuid4().hex[:6]}",
        "password": "Str0ngPassword!",
    })
    assert reg.status_code == 201, reg.text
    token = reg.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def auth_headers_2(client):
    """A second user — for ownership tests."""
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post("/api/v1/auth/register", json={
        "email": email,
        "username": f"creator_{uuid.uuid4().hex[:6]}",
        "password": "Str0ngPassword!",
    })
    assert reg.status_code == 201
    token = reg.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _make_project(client, headers, **kwargs) -> dict:
    """Helper — create a project and return its data."""
    payload = {
        "name": f"Test Project {uuid.uuid4().hex[:6]}",
        "content_type": "podcast",
        **kwargs,
    }
    resp = client.post("/api/v1/projects", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Projects CRUD ─────────────────────────────────────────────────────────────

class TestProjects:
    def test_create_project(self, client, auth_headers):
        resp = client.post("/api/v1/projects", json={
            "name": "My Podcast",
            "content_type": "podcast",
            "editor_mode": "podcast",
        }, headers=auth_headers)
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["name"] == "My Podcast"
        assert data["content_type"] == "podcast"
        assert "id" in data

    def test_create_project_requires_auth(self, client):
        resp = client.post("/api/v1/projects", json={"name": "No Auth"})
        assert resp.status_code == 401

    def test_list_projects_returns_own_projects(self, client, auth_headers):
        # Create two projects
        _make_project(client, auth_headers, name="Project A")
        _make_project(client, auth_headers, name="Project B")

        resp = client.get("/api/v1/projects", headers=auth_headers)
        assert resp.status_code == 200
        projects = resp.json()
        assert isinstance(projects, list)
        assert len(projects) >= 2

    def test_list_projects_excludes_other_users(self, client, auth_headers, auth_headers_2):
        """User 2 cannot see User 1's projects."""
        proj = _make_project(client, auth_headers)

        resp = client.get("/api/v1/projects", headers=auth_headers_2)
        assert resp.status_code == 200
        ids = [p["id"] for p in resp.json()]
        assert proj["id"] not in ids

    def test_get_project(self, client, auth_headers):
        proj = _make_project(client, auth_headers, name="Fetchable Project")
        resp = client.get(f"/api/v1/projects/{proj['id']}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "Fetchable Project"

    def test_get_project_returns_404_for_other_user(self, client, auth_headers, auth_headers_2):
        """User 2 cannot see User 1's project by ID."""
        proj = _make_project(client, auth_headers)
        resp = client.get(f"/api/v1/projects/{proj['id']}", headers=auth_headers_2)
        assert resp.status_code == 404

    def test_update_project_name(self, client, auth_headers):
        proj = _make_project(client, auth_headers, name="Original Name")
        resp = client.put(f"/api/v1/projects/{proj['id']}", json={
            "name": "Updated Name",
        }, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"

    def test_delete_project(self, client, auth_headers):
        proj = _make_project(client, auth_headers)
        resp = client.delete(f"/api/v1/projects/{proj['id']}", headers=auth_headers)
        assert resp.status_code == 204

        # Verify it's gone
        resp2 = client.get(f"/api/v1/projects/{proj['id']}", headers=auth_headers)
        assert resp2.status_code == 404

    def test_delete_nonexistent_project_returns_404(self, client, auth_headers):
        fake_id = str(uuid.uuid4())
        resp = client.delete(f"/api/v1/projects/{fake_id}", headers=auth_headers)
        assert resp.status_code == 404

    def test_project_has_request_id(self, client, auth_headers):
        resp = client.post("/api/v1/projects", json={"name": "Test"}, headers=auth_headers)
        assert "x-request-id" in resp.headers


# ── Assets ────────────────────────────────────────────────────────────────────

class TestAssets:
    @pytest.fixture(autouse=True)
    def setup_project(self, client, auth_headers):
        """Create a fresh project for each test."""
        self.project = _make_project(client, auth_headers)
        self.project_id = self.project["id"]
        self.headers = auth_headers
        self.client = client

    def test_create_asset_returns_upload_url(self):
        resp = self.client.post(
            f"/api/v1/projects/{self.project_id}/assets",
            json={
                "filename": "podcast.mp4",
                "mime_type": "video/mp4",
                "file_size": 10_000_000,
            },
            headers=self.headers,
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert "asset_id" in data
        assert "upload_url" in data
        assert "storage_key" in data
        assert data["method"] == "PUT"
        assert data["expires_in"] == 3600
        # Upload URL points to MinIO
        assert "viraedit-media" in data["upload_url"]

    def test_create_asset_storage_key_format(self):
        resp = self.client.post(
            f"/api/v1/projects/{self.project_id}/assets",
            json={"filename": "episode.mp4", "mime_type": "video/mp4"},
            headers=self.headers,
        )
        assert resp.status_code == 201
        key = resp.json()["storage_key"]
        assert key.startswith(f"projects/{self.project_id}/assets/")
        assert key.endswith("/episode.mp4")

    def test_create_asset_rejects_unsupported_type(self):
        resp = self.client.post(
            f"/api/v1/projects/{self.project_id}/assets",
            json={"filename": "doc.pdf", "mime_type": "application/pdf"},
            headers=self.headers,
        )
        assert resp.status_code in (415, 422, 400)

    def test_create_asset_rejects_too_large(self):
        resp = self.client.post(
            f"/api/v1/projects/{self.project_id}/assets",
            json={
                "filename": "huge.mp4",
                "mime_type": "video/mp4",
                "file_size": 11 * 1024 * 1024 * 1024,  # 11 GB
            },
            headers=self.headers,
        )
        assert resp.status_code in (413, 422, 400)

    def test_create_asset_requires_auth(self):
        resp = self.client.post(
            f"/api/v1/projects/{self.project_id}/assets",
            json={"filename": "test.mp4", "mime_type": "video/mp4"},
        )
        assert resp.status_code == 401

    def test_create_asset_on_foreign_project_returns_404(self, auth_headers_2):
        resp = self.client.post(
            f"/api/v1/projects/{self.project_id}/assets",
            json={"filename": "test.mp4", "mime_type": "video/mp4"},
            headers=auth_headers_2,
        )
        assert resp.status_code == 404

    def test_list_assets_returns_empty_initially(self):
        resp = self.client.get(
            f"/api/v1/projects/{self.project_id}/assets",
            headers=self.headers,
        )
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_assets_after_create(self):
        self.client.post(
            f"/api/v1/projects/{self.project_id}/assets",
            json={"filename": "podcast.mp4", "mime_type": "video/mp4"},
            headers=self.headers,
        )
        resp = self.client.get(
            f"/api/v1/projects/{self.project_id}/assets",
            headers=self.headers,
        )
        assert resp.status_code == 200
        assets = resp.json()
        assert len(assets) >= 1
        assert assets[0]["status"] == "uploading"

    def test_get_asset(self):
        create_resp = self.client.post(
            f"/api/v1/projects/{self.project_id}/assets",
            json={"filename": "podcast.mp4", "mime_type": "video/mp4"},
            headers=self.headers,
        )
        asset_id = create_resp.json()["asset_id"]

        resp = self.client.get(
            f"/api/v1/projects/{self.project_id}/assets/{asset_id}",
            headers=self.headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == asset_id
        assert data["original_filename"] == "podcast.mp4"
        assert data["media_type"] == "video"
        assert data["status"] == "uploading"

    def test_get_nonexistent_asset_returns_404(self):
        fake_id = str(uuid.uuid4())
        resp = self.client.get(
            f"/api/v1/projects/{self.project_id}/assets/{fake_id}",
            headers=self.headers,
        )
        assert resp.status_code == 404

    def test_delete_asset(self):
        create_resp = self.client.post(
            f"/api/v1/projects/{self.project_id}/assets",
            json={"filename": "to_delete.mp4", "mime_type": "video/mp4"},
            headers=self.headers,
        )
        assert create_resp.status_code == 201
        asset_id = create_resp.json()["asset_id"]

        del_resp = self.client.delete(
            f"/api/v1/projects/{self.project_id}/assets/{asset_id}",
            headers=self.headers,
        )
        assert del_resp.status_code == 204

        get_resp = self.client.get(
            f"/api/v1/projects/{self.project_id}/assets/{asset_id}",
            headers=self.headers,
        )
        assert get_resp.status_code == 404

    def test_confirm_upload_when_file_not_in_minio(self):
        """Confirming before actual upload marks asset as error."""
        create_resp = self.client.post(
            f"/api/v1/projects/{self.project_id}/assets",
            json={"filename": "not_uploaded.mp4", "mime_type": "video/mp4"},
            headers=self.headers,
        )
        asset_id = create_resp.json()["asset_id"]

        confirm_resp = self.client.post(
            f"/api/v1/projects/{self.project_id}/assets/{asset_id}/confirm",
            json={},
            headers=self.headers,
        )
        assert confirm_resp.status_code == 200
        data = confirm_resp.json()
        # File not in MinIO → status=error with friendly message
        assert data["status"] == "error"
        assert "upload" in data["error_message"].lower()

    def test_download_url_for_uploading_asset_returns_error(self):
        """Can't get download URL for an asset that's still uploading."""
        create_resp = self.client.post(
            f"/api/v1/projects/{self.project_id}/assets",
            json={"filename": "uploading.mp4", "mime_type": "video/mp4"},
            headers=self.headers,
        )
        asset_id = create_resp.json()["asset_id"]

        resp = self.client.get(
            f"/api/v1/projects/{self.project_id}/assets/{asset_id}/download-url",
            headers=self.headers,
        )
        assert resp.status_code in (400, 500)  # StorageError → 500
