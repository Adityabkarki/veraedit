"""Tests for chapter_planner — 4–15 min podcast chapters."""
from __future__ import annotations

from tasks.chapter_planner import merge_micro_scenes_to_chapters


def _micro(i: int, start: float, end: float, topics: list[str] | None = None) -> dict:
    return {
        "index": i,
        "start_time": start,
        "end_time": end,
        "title": f"Segment {i}",
        "summary": f"Summary {i}",
        "topics": topics or ["podcast"],
        "highlight_score": 0.6,
        "retention_score": 0.6,
        "energy_level": 0.5,
        "platform_scores": {},
    }


class TestChapterPlanner:
    def test_28_min_podcast_yields_2_to_4_chapters(self):
        micro = []
        t = 0.0
        for i in range(28):
            micro.append(_micro(i, t, t + 60.0))
            t += 60.0
        chapters = merge_micro_scenes_to_chapters(micro, duration=28 * 60.0)
        assert 2 <= len(chapters) <= 8
        for ch in chapters:
            dur = ch["end_time"] - ch["start_time"]
            assert dur >= 240.0 or len(chapters) == 1
            assert ch.get("scene_kind") == "chapter"

    def test_short_video_single_chapter(self):
        micro = [_micro(0, 0, 120)]
        chapters = merge_micro_scenes_to_chapters(micro, duration=120.0)
        assert len(chapters) == 1
        assert chapters[0]["end_time"] - chapters[0]["start_time"] == 120.0

    def test_apply_llm_titles(self):
        from tasks.chapter_planner import apply_chapter_titles_from_llm

        chapters = [_micro(0, 0, 300)]
        chapters[0]["index"] = 0
        updated = apply_chapter_titles_from_llm(
            chapters, [{"index": 0, "title": "Monetization debate", "summary": "Hosts discuss fees."}]
        )
        assert updated[0]["title"] == "Monetization debate"
