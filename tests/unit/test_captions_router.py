"""
Unit tests for captions router schemas (Module 03).
"""
import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


def test_job_type_includes_caption_jobs():
    from models.job import JobType

    assert JobType.TRANSCRIBE.value == "TRANSCRIBE"
    assert JobType.RENDER_CAPTIONS.value == "RENDER_CAPTIONS"


def test_transcribe_request_schema():
    from routers.captions import TranscribeRequest

    req = TranscribeRequest(
        video_key="projects/p1/raw/x.mp4",
        project_id=str(uuid.uuid4()),
        language="ne",
    )
    assert req.language == "ne"


def test_render_request_defaults_to_hormozi():
    from routers.captions import RenderCaptionsRequest

    req = RenderCaptionsRequest(
        video_key="projects/p1/raw/x.mp4",
        project_id=str(uuid.uuid4()),
        words=[{"word": "hi", "start": 0, "end": 0.5}],
    )
    assert req.style == "hormozi"


def test_caption_styles_endpoint():
    from routers.captions import caption_styles

    data = caption_styles()
    assert "hormozi" in data["styles"]
    assert "nepali_bold" in data["styles"]
    assert len(data["styles"]) == 5
