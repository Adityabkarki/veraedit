"""Tests for topic_shorts compiler and podcast_autopilot."""
from __future__ import annotations


def _scene(i, start, end, title, topics=None, score=7.5):
    return {
        "index": i,
        "start_time": start,
        "end_time": end,
        "title": title,
        "summary": f"Summary for {title}",
        "topics": topics or ["technology"],
        "transcript_excerpt": f"Excerpt {title}",
        "intent": "value",
        "editorial_adjusted_score": score,
        "highlight_score": 0.7,
        "energy_level": 0.6,
    }


class TestTopicShorts:
    def test_groups_scenes_by_topic(self):
        from tasks.topic_shorts import group_scenes_by_topic
        scenes = [
            _scene(0, 0, 40, "AI intro", ["ai"]),
            _scene(1, 200, 250, "AI returns", ["ai"]),
            _scene(2, 400, 450, "Cooking tips", ["cooking"]),
        ]
        groups = group_scenes_by_topic(scenes)
        assert "ai" in groups
        assert len(groups["ai"]) >= 2

    def test_extract_topic_shorts_min_duration(self):
        from tasks.topic_shorts import extract_topic_shorts
        scenes = [
            _scene(0, 0, 35, "Topic A part 1", ["marketing"]),
            _scene(1, 120, 160, "Topic A part 2", ["marketing"]),
            _scene(2, 300, 340, "Topic A part 3", ["marketing"]),
        ]
        cands = extract_topic_shorts(scenes)
        assert len(cands) >= 1
        assert cands[0].duration >= 30 or hasattr(cands[0], "_segment_count")

    def test_enrich_action_adds_segments(self):
        from tasks.topic_shorts import enrich_action_with_compilation
        from tasks.shorts_engine import ShortCandidate
        from tasks.platform_scorer import PlatformScores

        c = ShortCandidate(
            scene_indices=[0, 1],
            start_time=0,
            end_time=100,
            title="Marketing",
            summary="test",
            transcript_excerpt="test",
            dominant_intent="value",
            energy_level=0.6,
            hook_strength=0.7,
            viral_score=7.0,
            platform_scores=PlatformScores(),
        )
        c._topic_segments = [{"start_time": 0, "end_time": 35, "scene_index": 0}]  # type: ignore
        action = enrich_action_with_compilation({"title": "Marketing"}, c)
        assert action["compilation_type"] == "topic_compiled"
        assert len(action["segments"]) == 1


class TestPodcastAutopilot:
    def test_builds_filler_suggestion(self):
        from tasks.podcast_autopilot import build_podcast_autopilot_suggestions
        words = [
            {"word": "hello", "start": 0.0, "end": 0.5},
            {"word": "uh", "start": 0.6, "end": 0.8},
            {"word": "world", "start": 0.9, "end": 1.2},
        ]
        sugs = build_podcast_autopilot_suggestions(words, [], "podcast")
        types = [s["type"] for s in sugs]
        assert "REMOVE_FILLERS" in types

    def test_skips_non_podcast(self):
        from tasks.podcast_autopilot import build_podcast_autopilot_suggestions
        assert build_podcast_autopilot_suggestions([], [], "vlog") == []
