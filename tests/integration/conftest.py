"""
Integration test conftest.
The `client` fixture is provided by the root tests/conftest.py (session-scoped).
This file exists for integration-specific fixtures if needed in the future.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))
