"""Tests for editorial suggestion enhancement."""
from tasks.editorial_suggestions import build_content_type_suggestions, enhance_suggestion


def test_enhance_suggestion_adds_why_explanation():
    words = [{"word": "podcast intro", "start": 0.0, "end": 1.0, "type": "word"}]
    scenes = [{"start_time": 0, "end_time": 30, "title": "Introduction"}]
    sug = {
        "type": "cut",
        "title": "Trim pause",
        "description": "Remove dead air",
        "start_time": 0.0,
        "end_time": 1.0,
        "action": {},
    }
    out = enhance_suggestion(sug, words, "podcast", scenes)
    assert out["why_explanation"]
    assert "Podcast edit rule" in out["why_explanation"]
    assert out["action"].get("why_explanation")


def test_build_podcast_chapter_suggestions():
    words = [{"word": "hello", "start": 0, "end": 0.5}]
    scenes = [
        {"start_time": 0, "end_time": 20, "title": "Intro", "topics": ["intro"]},
        {"start_time": 20, "end_time": 60, "title": "Main topic", "topics": ["ai"]},
    ]
    sugs = build_content_type_suggestions(words, scenes, "podcast", 60.0)
    types = [s.get("action", {}).get("operation") for s in sugs]
    assert "add_chapter_marker" in types
