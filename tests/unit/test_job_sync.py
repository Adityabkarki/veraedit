"""
Unit tests for job sync helpers (Phase 01).

Run: pytest tests/unit/test_job_sync.py -v
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


class TestJobSyncHelpers:
    def test_get_job_sync_invalid_id_returns_none(self):
        from services.job_sync import get_job_sync

        assert get_job_sync("not-a-uuid") is None
