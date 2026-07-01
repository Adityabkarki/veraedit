"""Tests for stock/AI B-roll timeline insertion in broll_generation task."""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def timeline_row():
    tl_id = uuid.uuid4()
    data = {
        "version": 1,
        "tracks": [
            {
                "id": "track-video-1",
                "type": "video",
                "clips": [],
            }
        ],
    }
    return tl_id, 2, data


@patch("tasks.broll_generation._sync_engine")
def test_insert_timeline_clip_fetches_timeline_via_raw_sql(mock_engine, timeline_row):
    """Sync Connection cannot load ORM Timeline objects — use raw SQL rows."""
    from tasks.broll_generation import _insert_timeline_clip

    tl_id, version, data = timeline_row

    read_conn = MagicMock()
    read_result = MagicMock()
    read_result.fetchone.return_value = (tl_id, version, data)
    read_conn.execute.return_value = read_result

    write_conn = MagicMock()

    @contextmanager
    def connect_ctx():
        yield read_conn

    @contextmanager
    def begin_ctx():
        yield write_conn

    mock_engine.connect.side_effect = connect_ctx
    mock_engine.begin.side_effect = begin_ctx

    project_id = str(uuid.uuid4())
    asset_id = str(uuid.uuid4())

    _insert_timeline_clip(
        project_id=project_id,
        asset_id=asset_id,
        prompt="ghar",
        broll_reason="explanation",
        timeline_start=0.0,
        timeline_end=4.0,
        download_url="http://localhost:9000/viraedit-media/test.mp4",
        source="stock",
    )

    read_sql = str(read_conn.execute.call_args.args[0])
    assert "SELECT id, version, data FROM timelines" in read_sql

    tracks = data["tracks"]
    broll_track = next(t for t in tracks if "broll" in t.get("id", "").lower())
    assert len(broll_track["clips"]) == 1
    clip = broll_track["clips"][0]
    assert clip["asset_id"] == asset_id
    assert clip["effects"][0]["params"]["broll_type"] == "stock"

    assert write_conn.execute.call_count == 2
    update_call, insert_call = write_conn.execute.call_args_list
    assert "UPDATE timelines SET is_active = FALSE" in str(update_call.args[0])
    assert update_call.args[1]["id"] == tl_id

    insert_params = insert_call.args[1]
    assert insert_params["version"] == version + 1
    assert insert_params["parent_id"] == tl_id
