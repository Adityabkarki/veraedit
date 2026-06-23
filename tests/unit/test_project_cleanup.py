"""Unit tests for project hard-delete storage cleanup."""
import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest


def test_purge_project_storage_deletes_prefix_and_renders():
    from models.render import RenderStatus
    from services.project_cleanup import purge_project_storage

    project_id = uuid.uuid4()
    db = AsyncMock()

    asset_result = MagicMock()
    asset_result.all.return_value = [("task-trans-1", "task-analyze-1")]

    render_result = MagicMock()
    render_result.all.return_value = [
        ("task-render-1", f"renders/{project_id}/out.mp4", RenderStatus.PROCESSING),
    ]

    db.execute = AsyncMock(side_effect=[asset_result, render_result])

    storage = AsyncMock()
    storage.delete_prefix = AsyncMock(side_effect=[3, 1])
    storage.delete_object = AsyncMock()

    import sys
    fake_celery_mod = MagicMock()
    fake_celery_mod.celery_app = MagicMock()
    sys.modules["celery_app"] = fake_celery_mod

    summary = asyncio.run(purge_project_storage(project_id, db, storage))

    assert summary["media_objects_deleted"] == 3
    assert summary["temp_objects_deleted"] == 1
    assert summary["render_objects_deleted"] == 1
    storage.delete_prefix.assert_any_call(f"projects/{project_id}/", bucket="viraedit-media")
    storage.delete_prefix.assert_any_call(f"projects/{project_id}/", bucket="viraedit-temp")


def test_delete_prefix_batches_keys():
    """StorageService.delete_prefix paginates and batches delete_objects."""
    from storage import StorageService

    svc = StorageService()
    deleted_keys: list[str] = []

    class FakePaginator:
        def paginate(self, **_kwargs):
            yield {
                "Contents": [{"Key": f"projects/p1/assets/a{i}.mp4"} for i in range(3)],
            }

    class FakeClient:
        def get_paginator(self, _name):
            return FakePaginator()

        def delete_objects(self, **kwargs):
            deleted_keys.extend(obj["Key"] for obj in kwargs["Delete"]["Objects"])

    svc._client = FakeClient()

    count = asyncio.run(svc.delete_prefix("projects/p1/", bucket="viraedit-media"))
    assert count == 3
    assert len(deleted_keys) == 3
