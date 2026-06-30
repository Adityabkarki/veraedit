"""
Unit tests for render_from_template Celery task (Phase 06).
"""
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


class TestRenderFromTemplateTask:
    def test_task_uploads_assembled_video(self, monkeypatch, tmp_path):
        from tasks import render_from_template_task as task_module

        assembled = tmp_path / "out.mp4"
        assembled.write_bytes(b"video")

        monkeypatch.setattr(
            task_module,
            "render_video_from_template",
            lambda *a, **k: assembled.as_posix(),
        )
        monkeypatch.setattr(
            task_module.storage_sync,
            "put_file",
            MagicMock(),
        )
        monkeypatch.setattr(
            task_module.storage_sync,
            "get_presigned_url",
            lambda key, expires: f"https://cdn.example/{key}",
        )
        updates: list[dict] = []
        monkeypatch.setattr(
            task_module,
            "update_job_sync",
            lambda job_id, **kwargs: updates.append({"job_id": job_id, **kwargs}),
        )

        result = task_module.render_from_template_task(
            "job-123",
            "proj-456",
            {"slots": []},
            {"clip_1": {"storage_key": "library/x.mp4"}},
            {},
        )

        assert result["url"].startswith("https://cdn.example/")
        assert result["captions_included"] is False
        assert "caption_note" in result
        assert any(u.get("status") == "done" for u in updates)

    def test_task_marks_failed_on_render_error(self, monkeypatch):
        from tasks import render_from_template_task as task_module

        def boom(*a, **k):
            raise RuntimeError("FFmpeg failed")

        monkeypatch.setattr(task_module, "render_video_from_template", boom)
        updates: list[dict] = []
        monkeypatch.setattr(
            task_module,
            "update_job_sync",
            lambda job_id, **kwargs: updates.append({"job_id": job_id, **kwargs}),
        )

        with pytest.raises(RuntimeError, match="FFmpeg failed"):
            task_module.render_from_template_task(
                "job-err",
                "proj-1",
                {"slots": []},
                {},
                {},
            )

        assert any(u.get("status") == "failed" for u in updates)
