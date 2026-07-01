"""Tests for caption burn-in task routing and renderer choice."""

from __future__ import annotations

import inspect


def test_caption_render_task_uses_ass_not_remotion():
    from tasks import caption_tasks

    source = inspect.getsource(caption_tasks.render_captions_task)
    assert "render_captions(" in source
    assert "render_captions_v2" not in source


def test_caption_render_task_has_time_limit():
    from tasks.caption_tasks import render_captions_task

    assert render_captions_task.time_limit == 1800


def test_caption_render_routed_to_render_queue():
    from celery_app import celery_app

    routes = celery_app.conf.task_routes
    assert routes["tasks.caption.render"]["queue"] == "render"
    assert routes["tasks.caption.transcribe"]["queue"] == "transcription"
