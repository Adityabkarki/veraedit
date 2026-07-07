"""Tests for Phase 12 long-form analysis scaling."""
from services.director.analysis.plan_chunks import (
    CHUNK_THRESHOLD_SECONDS,
    DEFAULT_OVERLAP_SECONDS,
    plan_chunks,
)
from services.director.analysis.reconcile_diarization import reconcile_diarization
from services.director.analysis.reconcile_topics import reconcile_topics
from services.director.analysis.reconcile_triggers import reconcile_triggers
from services.director.extract_signals import extract_director_signals


def test_plan_chunks_single_below_threshold():
    plans = plan_chunks(10 * 60)
    assert len(plans) == 1
    assert plans[0].core_start == 0
    assert plans[0].core_end == 600


def test_plan_chunks_75_minute_podcast():
    duration = 75 * 60
    plans = plan_chunks(duration)
    assert len(plans) > 5
    assert plans[0].core_start == 0
    assert plans[-1].core_end == duration
    assert plans[0].window_end - plans[0].core_end == DEFAULT_OVERLAP_SECONDS


def test_plan_chunks_at_threshold_is_single():
    plans = plan_chunks(CHUNK_THRESHOLD_SECONDS)
    assert len(plans) == 1


def test_reconcile_triggers_dedupes_overlap():
    from services.director.analysis.plan_chunks import ChunkPlan

    c0 = ChunkPlan(0, 0, 540, 0, 565)
    c1 = ChunkPlan(1, 540, 1080, 515, 1105)
    low = {"start": 550, "end": 552, "confidence": 0.7, "value": "40%"}
    high = {"start": 550.1, "end": 552, "confidence": 0.95, "value": "40%"}
    result = reconcile_triggers([(c0, [low]), (c1, [high])])
    assert len(result) == 1
    assert result[0]["confidence"] == 0.95


def test_short_form_unchanged_with_chunking_enabled():
    segments = [
        {"text": "Welcome to the podcast episode.", "start": 0, "end": 3},
        {"text": "Revenue grew 25% year over year.", "start": 5, "end": 8},
    ]
    baseline = extract_director_signals(
        segments=segments,
        duration_seconds=10,
        use_chunking=False,
    )
    with_chunking = extract_director_signals(
        segments=segments,
        duration_seconds=10,
        use_chunking=True,
    )
    assert baseline["stats"] == with_chunking["stats"]
    assert baseline["topicShifts"] == with_chunking["topicShifts"]


def test_long_form_uses_chunked_path():
    duration = 20 * 60
    segments = [
        {
            "text": f"Segment at minute {m}. Revenue grew {10 + m}%.",
            "start": m * 60,
            "end": m * 60 + 30,
        }
        for m in range(20)
    ]
    payload = extract_director_signals(segments=segments, duration_seconds=duration)
    assert payload.get("chunked") is True
    assert payload.get("chunkCount", 0) >= 2
    assert len(payload["stats"]) >= 1


def test_reconcile_topics_merges_adjacent():
    from services.director.analysis.plan_chunks import ChunkPlan

    c0 = ChunkPlan(0, 0, 540, 0, 565)
    c1 = ChunkPlan(1, 540, 1080, 515, 1105)
    topics = reconcile_topics(
        [
            (
                c0,
                [
                    {"start": 0, "end": 300, "confidence": 0.8, "topicLabel": "Intro"},
                    {"start": 300, "end": 540, "confidence": 0.75, "topicLabel": "Growth"},
                ],
            ),
            (
                c1,
                [
                    {"start": 540, "end": 900, "confidence": 0.82, "topicLabel": "Growth"},
                ],
            ),
        ]
    )
    labels = {t["topicLabel"] for t in topics}
    assert "Intro" in labels
    assert "Growth" in labels


def test_reconcile_diarization_global_ids():
    from services.director.analysis.plan_chunks import ChunkPlan

    c0 = ChunkPlan(0, 0, 540, 0, 565)
    c1 = ChunkPlan(1, 540, 1080, 515, 1105)
    result = reconcile_diarization(
        [
            (
                c0,
                [
                    {"start": 0, "end": 200, "confidence": 0.8, "speakerId": "A"},
                    {"start": 520, "end": 560, "confidence": 0.8, "speakerId": "B"},
                ],
                None,
            ),
            (
                c1,
                [
                    {"start": 520, "end": 560, "confidence": 0.85, "speakerId": "A"},
                    {"start": 560, "end": 900, "confidence": 0.8, "speakerId": "B"},
                ],
                {"A": [520.0, 560.0, 40.0], "B": [560.0, 900.0, 340.0]},
            ),
        ]
    )
    assert len(result) >= 2


def test_record_chunk_atomic():
    from services.ai_budget import budget

    budget.reset()
    budget.record_chunk_atomic(
        0.05,
        chunk_index=2,
        workspace_id="ws-test",
        project_id="proj-test",
        action="topic_segmentation_chunk",
    )
    assert budget.total_usd == 0.05
    assert budget.actions[-1]["task"] == "topic_segmentation_chunk"
