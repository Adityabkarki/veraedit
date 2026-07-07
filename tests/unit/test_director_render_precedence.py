"""Tests for Director render path precedence (Primacy Law)."""
from services.director.render_precedence import (
    project_uses_director_engine,
    should_use_compiled_director_timeline,
)


def test_project_uses_director_engine_flag():
    assert project_uses_director_engine({"useDirectorEngine": True}) is True
    assert project_uses_director_engine({"use_director_engine": True}) is True
    assert project_uses_director_engine({}) is False
    assert project_uses_director_engine(None) is False


def test_should_use_compiled_when_flag_on_and_timeline_exists():
    compiled = {"tracks": {"video": [{"id": "v1"}]}}
    assert should_use_compiled_director_timeline(
        settings={"useDirectorEngine": True},
        compiled_timeline=compiled,
    ) is True


def test_should_not_use_compiled_when_flag_off_even_if_timeline_exists():
    compiled = {"tracks": {"video": [{"id": "v1"}]}}
    assert should_use_compiled_director_timeline(
        settings={"useDirectorEngine": False},
        compiled_timeline=compiled,
    ) is False


def test_should_not_use_compiled_when_no_timeline():
    assert should_use_compiled_director_timeline(
        settings={"useDirectorEngine": True},
        compiled_timeline=None,
    ) is False


def test_should_not_merge_sources_precedence_is_exclusive():
    """Compiled path requires both flag and timeline — never a partial merge."""
    bridged_has_motion = {
        "tracks": {"motionGraphics": [{"id": "mg1"}], "video": [{"id": "v1"}]},
    }
    assert should_use_compiled_director_timeline(
        settings={"useDirectorEngine": True},
        compiled_timeline=bridged_has_motion,
    ) is True
