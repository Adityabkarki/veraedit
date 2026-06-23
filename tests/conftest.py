"""
Root conftest — session-scoped TestClient shared by ALL tests.

Why session scope?
  - All tests that import `from main import app` get the SAME app object
    (Python module caching).
  - Multiple TestClient contexts against the same app teardown the connection
    pool and Redis client, breaking subsequent test modules.
  - One session-scoped client = one lifespan = one stable DB pool + Redis.

Tests that don't need a live server (pure unit tests) ignore this fixture.
"""
import sys
import os

# Make `apps/api` importable from anywhere in the test tree
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "api"))

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    """
    One TestClient for the entire test session.
    Shared by test_api_core.py, test_auth_api.py, test_projects_assets_api.py, etc.
    """
    from main import app
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
