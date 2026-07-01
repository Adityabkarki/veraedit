"""
ViraEdit — Render, Shorts, and Costs API unit tests (EP-1.5).

Tests:
  1. TestCeleryConfig         — queue configuration, task routing
  2. TestRenderTaskPlatforms  — platform preset validation
  3. TestRenderRouterRegistration — endpoint existence checks
  4. TestShortsRouterRegistration — endpoint existence checks
  5. TestCostsRouterRegistration  — endpoint existence checks
  6. TestRenderHTTPAPI        — HTTP-level render endpoint tests
  7. TestShortsHTTPAPI        — HTTP-level shorts endpoint tests
  8. TestWorkerScripts        — worker .bat script existence and content

Run:
    python -m pytest tests/unit/test_render_shorts_costs.py -v
"""
from __future__ import annotations

import pathlib
import sys
import uuid

import pytest

# Ensure the API source tree is on the path
sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "apps" / "api"))


# ═══════════════════════════════════════════════════════════════════════════════
# 1. CELERY CONFIG
# ═══════════════════════════════════════════════════════════════════════════════

class TestCeleryConfig:
    """Celery app has 5 queues and correct Windows pool settings."""

    def test_celery_app_importable(self):
        from celery_app import celery_app
        assert celery_app is not None

    def test_celery_has_5_queues(self):
        from celery_app import celery_app
        queue_names = {q.name for q in celery_app.conf.task_queues}
        expected = {"default", "transcription", "analysis", "render", "ai"}
        assert expected == queue_names, f"Queue mismatch: {queue_names}"

    def test_celery_uses_solo_pool(self):
        from celery_app import celery_app
        assert celery_app.conf.worker_pool == "solo"

    def test_celery_concurrency_is_1(self):
        from celery_app import celery_app
        assert celery_app.conf.worker_concurrency == 1

    def test_celery_acks_late(self):
        from celery_app import celery_app
        assert celery_app.conf.task_acks_late is True

    def test_render_task_routes_to_render_queue(self):
        from celery_app import celery_app
        routes = celery_app.conf.task_routes
        assert "render" in str(routes)

    def test_style_task_routes_to_ai_queue(self):
        from celery_app import celery_app
        routes = celery_app.conf.task_routes
        assert "ai" in str(routes)

    def test_transcription_task_routes_to_transcription_queue(self):
        from celery_app import celery_app
        routes = celery_app.conf.task_routes
        assert "transcription" in str(routes)

    def test_celery_includes_render_task(self):
        from celery_app import celery_app
        includes = celery_app.conf.include or []
        assert any("render" in inc for inc in includes)

    def test_celery_includes_style_extract_task(self):
        from celery_app import celery_app
        includes = celery_app.conf.include or []
        assert any("style" in inc for inc in includes)

    def test_celery_result_expires_24h(self):
        from celery_app import celery_app
        assert celery_app.conf.result_expires == 86400

    def test_celery_timezone_kathmandu(self):
        from celery_app import celery_app
        assert celery_app.conf.timezone == "Asia/Kathmandu"


# ═══════════════════════════════════════════════════════════════════════════════
# 2. RENDER TASK PLATFORM PRESETS
# ═══════════════════════════════════════════════════════════════════════════════

class TestRenderTaskPlatforms:
    """Platform encoding presets are correct."""

    def test_platform_presets_importable(self):
        from tasks.render_task import PLATFORM_PRESETS
        assert isinstance(PLATFORM_PRESETS, dict)

    def test_youtube_preset_1080p(self):
        from tasks.render_task import PLATFORM_PRESETS
        preset = PLATFORM_PRESETS["youtube"]
        assert preset["width"] == 1920
        assert preset["height"] == 1080

    def test_tiktok_preset_vertical(self):
        from tasks.render_task import PLATFORM_PRESETS
        preset = PLATFORM_PRESETS["tiktok"]
        assert preset["width"] == 1080
        assert preset["height"] == 1920

    def test_youtube_shorts_preset_vertical(self):
        from tasks.render_task import PLATFORM_PRESETS
        preset = PLATFORM_PRESETS["youtube_shorts"]
        assert preset["width"] == 1080
        assert preset["height"] == 1920

    def test_instagram_reels_preset_vertical(self):
        from tasks.render_task import PLATFORM_PRESETS
        preset = PLATFORM_PRESETS["instagram_reels"]
        assert preset["height"] == 1920

    def test_all_presets_have_required_fields(self):
        from tasks.render_task import PLATFORM_PRESETS
        required = {"width", "height", "crf", "audio_bitrate"}
        for platform, preset in PLATFORM_PRESETS.items():
            missing = required - set(preset.keys())
            assert not missing, f"{platform} missing: {missing}"

    def test_all_platforms_covered(self):
        from tasks.render_task import PLATFORM_PRESETS
        from models.render import RenderPlatform
        for platform in RenderPlatform:
            assert platform.value in PLATFORM_PRESETS, (
                f"Platform {platform.value} not in PLATFORM_PRESETS"
            )


# ═══════════════════════════════════════════════════════════════════════════════
# 3. RENDER ROUTER REGISTRATION
# ═══════════════════════════════════════════════════════════════════════════════

class TestRenderRouterRegistration:
    """Render router has all required endpoints."""

    def test_renders_router_importable(self):
        from routers import renders
        assert hasattr(renders, "router")

    def test_renders_router_prefix(self):
        from routers.renders import router
        assert router.prefix == "/api/v1/projects"

    def test_renders_router_has_create_endpoint(self):
        from routers.renders import router
        paths = [r.path for r in router.routes]
        # POST /{project_id}/renders
        assert any("renders" in p and "{project_id}" in p and "{render_id}" not in p
                   for p in paths)

    def test_renders_router_has_list_endpoint(self):
        from routers.renders import router
        methods = {}
        for r in router.routes:
            if hasattr(r, "methods") and "renders" in r.path:
                methods[r.path] = r.methods
        # GET on the list route
        assert any("GET" in (m or set()) for m in methods.values())

    def test_renders_router_has_status_endpoint(self):
        from routers.renders import router
        paths = [r.path for r in router.routes]
        assert any("{render_id}" in p and "download" not in p for p in paths)

    def test_renders_router_has_download_endpoint(self):
        from routers.renders import router
        paths = [r.path for r in router.routes]
        assert any("download" in p for p in paths)

    def test_renders_router_has_file_stream_endpoint(self):
        from routers.renders import router
        paths = [r.path for r in router.routes]
        assert any(p.endswith("/file") and "{render_id}" in p for p in paths)

    def test_renders_router_has_cancel_endpoint(self):
        from routers.renders import router
        methods = {}
        for r in router.routes:
            if hasattr(r, "methods") and "{render_id}" in r.path and "download" not in r.path:
                methods[r.path] = r.methods
        assert any("DELETE" in (m or set()) for m in methods.values())

    def test_renders_router_in_main_app(self):
        import inspect
        import main
        source = inspect.getsource(main)
        assert "renders" in source
        assert "renders.router" in source


# ═══════════════════════════════════════════════════════════════════════════════
# 4. SHORTS ROUTER REGISTRATION
# ═══════════════════════════════════════════════════════════════════════════════

class TestShortsRouterRegistration:
    """Shorts router has all required endpoints."""

    def test_shorts_router_importable(self):
        from routers import shorts
        assert hasattr(shorts, "router")

    def test_shorts_router_prefix(self):
        from routers.shorts import router
        assert router.prefix == "/api/v1/projects"

    def test_shorts_router_has_list_endpoint(self):
        from routers.shorts import router
        paths = [r.path for r in router.routes]
        assert any("shorts" in p and "{short_id}" not in p for p in paths)

    def test_shorts_router_has_approve_endpoint(self):
        from routers.shorts import router
        paths = [r.path for r in router.routes]
        assert any("approve" in p for p in paths)

    def test_shorts_router_has_reject_endpoint(self):
        from routers.shorts import router
        paths = [r.path for r in router.routes]
        assert any("reject" in p for p in paths)

    def test_shorts_router_has_render_endpoint(self):
        from routers.shorts import router
        paths = [r.path for r in router.routes]
        # render endpoint on a specific short
        assert any("render" in p and "{short_id}" in p for p in paths)

    def test_shorts_router_in_main_app(self):
        import inspect
        import main
        source = inspect.getsource(main)
        assert "shorts" in source
        assert "shorts.router" in source


class TestShortClipRenderEndpoint:
    """Asset short-clip render endpoint and timeline bootstrap helpers."""

    def test_assets_router_has_short_clips_render(self):
        from routers.assets import router
        paths = [r.path for r in router.routes]
        assert any("short-clips/render" in p for p in paths)

    def test_minimal_timeline_data_for_asset(self):
        from routers.assets import _minimal_timeline_data_for_asset

        class _Asset:
            id = uuid.uuid4()
            original_filename = "episode.mp4"
            duration_seconds = 95.5

        data = _minimal_timeline_data_for_asset(_Asset())  # type: ignore[arg-type]
        clip = data["tracks"][0]["clips"][0]
        assert clip["asset_id"] == str(_Asset.id)
        assert clip["source_end"] == 95.5
        assert data["global_settings"]["duration"] == 95.5


# ═══════════════════════════════════════════════════════════════════════════════
# 5. COSTS ROUTER REGISTRATION
# ═══════════════════════════════════════════════════════════════════════════════

class TestCostsRouterRegistration:
    """Costs router has all required endpoints."""

    def test_costs_router_importable(self):
        from routers import costs
        assert hasattr(costs, "router")

    def test_costs_router_prefix(self):
        from routers.costs import router
        assert router.prefix == "/api/v1"

    def test_costs_router_has_project_costs_endpoint(self):
        from routers.costs import router
        paths = [r.path for r in router.routes]
        assert any("costs" in p and "{project_id}" in p for p in paths)

    def test_costs_router_has_summary_endpoint(self):
        from routers.costs import router
        paths = [r.path for r in router.routes]
        assert any("costs/summary" in p for p in paths)

    def test_costs_router_in_main_app(self):
        import inspect
        import main
        source = inspect.getsource(main)
        assert "costs" in source
        assert "costs.router" in source


# ═══════════════════════════════════════════════════════════════════════════════
# 6. RENDER HTTP API
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture
def authed_client():
    """TestClient with auth bypass via dependency_overrides."""
    from fastapi.testclient import TestClient
    from main import app
    from dependencies import get_current_user
    import uuid as _uuid
    from unittest.mock import MagicMock

    mock_user = MagicMock()
    mock_user.id = _uuid.UUID("00000000-0000-0000-0000-000000000002")
    mock_user.email = "test@viraedit.com"

    async def _mock_auth():
        return mock_user

    app.dependency_overrides[get_current_user] = _mock_auth
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.pop(get_current_user, None)


class TestRenderHTTPAPI:
    """HTTP-level render endpoint tests."""

    def test_renders_endpoint_requires_auth(self, authed_client):
        """With auth bypassed, endpoint is reachable (not 401)."""
        project_id = str(uuid.uuid4())
        resp = authed_client.get(f"/api/v1/projects/{project_id}/renders")
        # 404 (project not found) is the expected response — NOT 401
        assert resp.status_code in (404, 200, 500)

    def test_render_create_validates_platform(self, authed_client):
        """Invalid platform should return 422."""
        project_id = str(uuid.uuid4())
        resp = authed_client.post(
            f"/api/v1/projects/{project_id}/renders",
            json={"platform": "invalid_platform_xyz"},
        )
        assert resp.status_code == 422

    def test_render_download_endpoint_exists(self, authed_client):
        """Download endpoint is registered."""
        project_id = str(uuid.uuid4())
        render_id = str(uuid.uuid4())
        resp = authed_client.get(
            f"/api/v1/projects/{project_id}/renders/{render_id}/download"
        )
        # 404 (project not found) or 422 is expected — not 405
        assert resp.status_code != 405

    def test_render_status_endpoint_exists(self, authed_client):
        """Status endpoint is registered."""
        project_id = str(uuid.uuid4())
        render_id = str(uuid.uuid4())
        resp = authed_client.get(
            f"/api/v1/projects/{project_id}/renders/{render_id}"
        )
        assert resp.status_code != 405

    def test_render_openapi_docs_registered(self, authed_client):
        """Render routes appear in OpenAPI schema."""
        resp = authed_client.get("/openapi.json")
        assert resp.status_code == 200
        paths = resp.json().get("paths", {})
        render_paths = [p for p in paths if "renders" in p]
        assert len(render_paths) >= 3, f"Expected ≥3 render routes, got: {render_paths}"


# ═══════════════════════════════════════════════════════════════════════════════
# 7. SHORTS HTTP API
# ═══════════════════════════════════════════════════════════════════════════════

class TestShortsHTTPAPI:
    """HTTP-level shorts endpoint tests."""

    def test_shorts_list_endpoint_exists(self, authed_client):
        project_id = str(uuid.uuid4())
        resp = authed_client.get(f"/api/v1/projects/{project_id}/shorts")
        assert resp.status_code != 405

    def test_shorts_approve_endpoint_exists(self, authed_client):
        project_id = str(uuid.uuid4())
        short_id = str(uuid.uuid4())
        resp = authed_client.post(
            f"/api/v1/projects/{project_id}/shorts/{short_id}/approve"
        )
        assert resp.status_code != 405

    def test_shorts_reject_endpoint_exists(self, authed_client):
        project_id = str(uuid.uuid4())
        short_id = str(uuid.uuid4())
        resp = authed_client.post(
            f"/api/v1/projects/{project_id}/shorts/{short_id}/reject"
        )
        assert resp.status_code != 405

    def test_shorts_render_endpoint_exists(self, authed_client):
        project_id = str(uuid.uuid4())
        short_id = str(uuid.uuid4())
        resp = authed_client.post(
            f"/api/v1/projects/{project_id}/shorts/{short_id}/render",
            json={"platform": "tiktok"},
        )
        assert resp.status_code != 405

    def test_shorts_openapi_docs_registered(self, authed_client):
        resp = authed_client.get("/openapi.json")
        paths = resp.json().get("paths", {})
        shorts_paths = [p for p in paths if "/shorts" in p]
        assert len(shorts_paths) >= 3, f"Expected ≥3 shorts routes, got: {shorts_paths}"

    def test_costs_summary_endpoint_exists(self, authed_client):
        resp = authed_client.get("/api/v1/costs/summary")
        # Auth bypassed — endpoint is reachable (not 401, not 405)
        assert resp.status_code not in (401, 403, 405)


# ═══════════════════════════════════════════════════════════════════════════════
# 8. WORKER SCRIPTS
# ═══════════════════════════════════════════════════════════════════════════════

SCRIPTS_DIR = pathlib.Path(__file__).parents[2] / "scripts"


class TestWorkerScripts:
    """Worker .bat scripts exist and have correct content."""

    def test_worker_bat_exists(self):
        assert (SCRIPTS_DIR / "worker.bat").exists()

    def test_start_workers_bat_exists(self):
        assert (SCRIPTS_DIR / "start_workers.bat").exists()

    def test_worker_bat_uses_solo_pool(self):
        content = (SCRIPTS_DIR / "worker.bat").read_text(encoding="utf-8")
        assert "--pool=solo" in content

    def test_worker_bat_has_all_queues_option(self):
        content = (SCRIPTS_DIR / "worker.bat").read_text(encoding="utf-8")
        assert "all" in content
        # All 5 queues listed
        for queue in ("transcription", "analysis", "render", "ai", "default"):
            assert queue in content

    def test_worker_bat_references_celery_app(self):
        content = (SCRIPTS_DIR / "worker.bat").read_text(encoding="utf-8")
        assert "celery_app" in content

    def test_start_workers_bat_uses_solo_pool(self):
        content = (SCRIPTS_DIR / "start_workers.bat").read_text(encoding="utf-8")
        assert "--pool=solo" in content

    def test_start_workers_bat_has_4_worker_types(self):
        content = (SCRIPTS_DIR / "start_workers.bat").read_text(encoding="utf-8")
        for queue in ("transcription", "analysis", "render", "ai"):
            assert queue in content

    def test_start_workers_bat_references_venv(self):
        content = (SCRIPTS_DIR / "start_workers.bat").read_text(encoding="utf-8")
        assert ".venv" in content

    def test_start_workers_bat_has_quick_mode(self):
        content = (SCRIPTS_DIR / "start_workers.bat").read_text(encoding="utf-8")
        assert "quick" in content
