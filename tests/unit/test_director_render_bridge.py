"""Tests for Director render bridge helpers."""
import uuid

from models.project import ContentType, Project
from services.director.render_bridge import project_uses_director_engine


def test_project_uses_director_engine_flag():
    base = dict(user_id=uuid.uuid4(), name="x", content_type=ContentType.PODCAST)
    assert project_uses_director_engine(Project(**base, settings={"useDirectorEngine": True})) is True
    assert project_uses_director_engine(Project(**base, settings={"use_director_engine": True})) is True
    assert project_uses_director_engine(Project(**base, settings={})) is False
