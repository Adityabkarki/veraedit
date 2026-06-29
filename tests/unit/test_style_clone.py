"""
Unit tests for template model and schemas (Module 02).
"""
import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


def test_template_model_table_name():
    from models.template import Template

    assert Template.__tablename__ == "templates"


def test_job_type_includes_style_clone():
    from models.job import JobType

    assert JobType.STYLE_CLONE.value == "STYLE_CLONE"


def test_style_clone_request_schema():
    from routers.style_clone import StyleCloneRequest

    req = StyleCloneRequest(
        video_key="projects/p1/raw/x.mp4",
        project_id=str(uuid.uuid4()),
        name="TikTok clone",
    )
    assert req.name == "TikTok clone"
