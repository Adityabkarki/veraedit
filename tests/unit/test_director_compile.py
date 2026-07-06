"""Tests for Director compile helpers and API orchestration."""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models import Asset, AssetStatus, ContentType, DirectorTimelineRecord, MediaType, Project, Transcript, TranscriptStatus
from services.director.compile_timeline import (
    ManualOverridesPresentError,
    compile_project_director_timeline,
)
from services.director.content_type_map import (
    default_dimensions,
    resolve_director_content_type,
)
from services.director.transcript_segments import words_to_segments


def test_words_to_segments_splits_on_gaps():
    words = [
        {"word": "Hello", "start": 0.0, "end": 0.4},
        {"word": "world", "start": 0.5, "end": 0.9},
        {"word": "again", "start": 3.0, "end": 3.4},
    ]
    segments = words_to_segments(words, gap_seconds=1.0)
    assert len(segments) == 2
    assert segments[0]["text"] == "Hello world"
    assert segments[1]["text"] == "again"


def test_resolve_director_content_type_mapping():
    assert resolve_director_content_type(project_content_type=ContentType.PODCAST) == "podcast"
    assert resolve_director_content_type(project_content_type=ContentType.TUTORIAL) == "consultancy"
    assert resolve_director_content_type(project_content_type=ContentType.SHORTS) == "social"
    assert resolve_director_content_type(project_content_type=ContentType.PODCAST, override="showcase") == "showcase"


def test_default_dimensions_for_social_is_vertical():
    assert default_dimensions("social") == (1080, 1920)


@pytest.mark.asyncio
async def test_compile_blocks_when_manual_overrides_present():
    project_id = uuid.uuid4()
    project = Project(
        id=project_id,
        user_id=uuid.uuid4(),
        name="Override test",
        content_type=ContentType.PODCAST,
    )
    active = DirectorTimelineRecord(
        project_id=project_id,
        version=1,
        content_type="podcast",
        data={"triggers": []},
        has_manual_overrides=True,
        is_active=True,
    )

    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
            _scalar_result(active),
            _scalar_result(
                Asset(
                    id=uuid.uuid4(),
                    project_id=project_id,
                    name="main",
                    original_filename="main.mp4",
                    storage_key="k",
                    media_type=MediaType.VIDEO,
                    status=AssetStatus.READY,
                    duration_seconds=30.0,
                )
            ),
        ]
    )

    with pytest.raises(ManualOverridesPresentError) as exc:
        await compile_project_director_timeline(project=project, db=db, overwrite=False)
    assert exc.value.existing_timeline_id == active.id


@pytest.mark.asyncio
async def test_compile_persists_timeline_when_remotion_succeeds():
    project_id = uuid.uuid4()
    asset_id = uuid.uuid4()
    project = Project(
        id=project_id,
        user_id=uuid.uuid4(),
        name="Compile test",
        content_type=ContentType.PODCAST,
    )
    asset = Asset(
        id=asset_id,
        project_id=project_id,
        name="main",
        original_filename="main.mp4",
        storage_key="k",
        media_type=MediaType.VIDEO,
        status=AssetStatus.READY,
        duration_seconds=30.0,
    )
    transcript = Transcript(
        asset_id=asset_id,
        language="ne",
        status=TranscriptStatus.READY,
        words=[
            {"word": "नमस्ते", "start": 0.0, "end": 0.5},
            {"word": "संसार", "start": 0.6, "end": 1.0},
        ],
    )
    fake_timeline = {
        "schemaVersion": 1,
        "projectId": str(project_id),
        "contentType": "podcast",
        "fps": 30,
        "durationInFrames": 900,
        "width": 1920,
        "height": 1080,
        "theme": {},
        "tracks": {
            "video": [{"id": "v1"}],
            "audio": [],
            "captions": [],
            "broll": [],
            "motionGraphics": [{"id": "mg1", "triggerId": "t1"}],
            "transitions": [],
            "vfx": [],
            "sfx": [],
            "multicam": [],
        },
        "triggers": [{"id": "t1", "status": "realized"}],
    }

    db = AsyncMock()
    asset_result = MagicMock()
    asset_result.scalars.return_value.all.return_value = [asset]

    db.execute = AsyncMock(
        side_effect=[
            _scalar_result(None),
            asset_result,
            _scalar_result(transcript),
        ]
    )
    db.add = lambda *_args, **_kwargs: None
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock(side_effect=lambda record: setattr(record, "id", uuid.uuid4()))

    with (
        patch(
            "services.director.compile_timeline.compile_director_timeline",
            new=AsyncMock(return_value=fake_timeline),
        ),
        patch(
            "services.director.compile_timeline.ensure_project_camera_feeds",
            new=AsyncMock(return_value=[]),
        ),
        patch(
            "services.director.compile_timeline.resolve_broll_entries",
            side_effect=lambda tl, **_: tl,
        ),
    ):
        result = await compile_project_director_timeline(project=project, db=db)

    assert result["timeline"] == fake_timeline
    assert result["version"] == 1
    assert result["hasManualOverrides"] is False
    assert "timelineId" in result


def _scalar_result(value):
    result = AsyncMock()
    result.scalar_one_or_none = lambda: value
    return result
