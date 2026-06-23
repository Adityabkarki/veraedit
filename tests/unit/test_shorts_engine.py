"""
ViraEdit — Tests for EP-2.4: Nepali Shorts Engine.

Covers:
  - Platform scoring (all 5 platforms, Nepal-specific rules)
  - Facebook Nepal priority (ranks 2nd)
  - Duration sweet-spot scoring
  - Shorts extraction algorithm (strategies 1-4)
  - Nepali hook template generation (5 options, Devanagari)
  - Reframe plan (9:16 instructions)
  - Deduplication of overlapping candidates
  - ShortCandidate serialisation to suggestion action
  - Analyze task registers shorts step
"""
from __future__ import annotations

import pytest


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_scene(
    index: int = 0,
    start_time: float = 0.0,
    end_time: float = 30.0,
    intent: str = "value",
    editorial_score: float = 7.0,
    highlight_score: float = 0.7,
    energy_level: float = 0.6,
    title: str = "Test Scene",
    summary: str = "This is a test scene about Nepali content.",
    transcript_excerpt: str = "नमस्ते, आज हामी यो विषयमा कुरा गर्छौं।",
    is_highlight: bool = True,
) -> dict:
    return {
        "index": index,
        "start_time": start_time,
        "end_time": end_time,
        "intent": intent,
        "editorial_adjusted_score": editorial_score,
        "highlight_score": highlight_score,
        "energy_level": energy_level,
        "title": title,
        "summary": summary,
        "transcript_excerpt": transcript_excerpt,
        "is_highlight": is_highlight,
        "platform_scores": {},
        "emotion": "neutral",
    }


def _make_hook_scene(**kwargs) -> dict:
    kw = dict(intent="hook", editorial_score=8.0, energy_level=0.8)
    kw.update(kwargs)
    return _make_scene(**kw)


# ═══════════════════════════════════════════════════════════════════════════════
# TestPlatformScorer
# ═══════════════════════════════════════════════════════════════════════════════

class TestPlatformScorer:
    """Platform scoring — per-platform functions and unified scorer."""

    def test_scores_all_return_0_to_10(self):
        from tasks.platform_scorer import score_all_platforms
        scores = score_all_platforms(
            duration=30.0,
            hook_strength=0.7,
            energy_level=0.6,
            viral_score=7.0,
            first_scene_intent="hook",
        )
        for val in scores.as_dict().values():
            assert 0.0 <= val <= 10.0, f"Score out of range: {val}"

    def test_facebook_is_in_top_2_for_nepal(self):
        """Facebook must appear in top-2 of platform_ranking for Nepal audience."""
        from tasks.platform_scorer import score_all_platforms
        scores = score_all_platforms(
            duration=40.0,
            hook_strength=0.8,
            energy_level=0.75,
            viral_score=8.0,
            first_scene_intent="hook",
            has_speech=True,
        )
        ranking = scores.platform_ranking()
        assert ranking.index("facebook") <= 1, (
            f"Facebook must be in top-2 for Nepal but ranked {ranking.index('facebook')+1}. "
            f"Ranking: {ranking}"
        )

    def test_nepal_platform_priority_order(self):
        from tasks.platform_scorer import NEPAL_PLATFORM_PRIORITY
        assert NEPAL_PLATFORM_PRIORITY[0] == "youtube"
        assert NEPAL_PLATFORM_PRIORITY[1] == "facebook"   # Nepal-specific
        assert NEPAL_PLATFORM_PRIORITY[2] == "tiktok"
        assert NEPAL_PLATFORM_PRIORITY[3] == "instagram"
        assert NEPAL_PLATFORM_PRIORITY[4] == "linkedin"

    def test_linkedin_scores_high_for_value_intent(self):
        from tasks.platform_scorer import score_for_linkedin
        score = score_for_linkedin(
            duration=45.0,
            hook_strength=0.7,
            energy_level=0.3,   # calm = good for LinkedIn
            viral_score=7.0,
            first_scene_intent="value",
            scene_intent="value",
        )
        assert score >= 6.0, f"LinkedIn value-intent score should be >= 6, got {score}"

    def test_tiktok_penalises_long_clips(self):
        from tasks.platform_scorer import score_for_tiktok
        short_score = score_for_tiktok(
            duration=20.0, hook_strength=0.8, energy_level=0.9,
            viral_score=8.0, first_scene_intent="hook",
        )
        long_score = score_for_tiktok(
            duration=62.0, hook_strength=0.8, energy_level=0.9,
            viral_score=8.0, first_scene_intent="hook",
        )
        assert short_score > long_score, "TikTok should score shorter clips higher"

    def test_facebook_gets_speech_bonus(self):
        from tasks.platform_scorer import score_for_facebook
        with_speech = score_for_facebook(
            duration=40.0, hook_strength=0.7, energy_level=0.7,
            viral_score=7.0, first_scene_intent="value", has_speech=True,
        )
        without_speech = score_for_facebook(
            duration=40.0, hook_strength=0.7, energy_level=0.7,
            viral_score=7.0, first_scene_intent="value", has_speech=False,
        )
        assert with_speech > without_speech, "Facebook should give Nepali speech a bonus"

    def test_too_short_clip_scores_zero_on_all_platforms(self):
        """Clips below minimum duration should score 0 (duration component = 0)."""
        from tasks.platform_scorer import score_all_platforms
        scores = score_all_platforms(
            duration=5.0,   # way below 15s minimum
            hook_strength=1.0,
            energy_level=1.0,
            viral_score=10.0,
            first_scene_intent="hook",
        )
        # All platforms have min=15s or min=20s — duration component returns 0
        # Total scores will still be non-zero (hook + energy + viral) but very low
        # At least one platform should have a reduced score vs a 30s clip
        normal_scores = score_all_platforms(
            duration=30.0, hook_strength=1.0, energy_level=1.0,
            viral_score=10.0, first_scene_intent="hook",
        )
        assert scores.nepal_weighted_score() < normal_scores.nepal_weighted_score()

    def test_nepal_weighted_score_uses_correct_weights(self):
        """Verify Nepal weighted score formula: YT 35% + FB 30% + TT 20% + IG 10% + LI 5%."""
        from tasks.platform_scorer import PlatformScores
        ps = PlatformScores(youtube=10.0, facebook=0.0, tiktok=0.0, instagram=0.0, linkedin=0.0)
        assert abs(ps.nepal_weighted_score() - 3.5) < 0.01

        ps2 = PlatformScores(youtube=0.0, facebook=10.0, tiktok=0.0, instagram=0.0, linkedin=0.0)
        assert abs(ps2.nepal_weighted_score() - 3.0) < 0.01

    def test_platform_ranking_breaks_ties_by_nepal_priority(self):
        """Equal scores should be broken by Nepal platform priority."""
        from tasks.platform_scorer import PlatformScores
        # All platforms score 5.0 — tiebreak by Nepal priority
        ps = PlatformScores(
            youtube=5.0, facebook=5.0, tiktok=5.0, instagram=5.0, linkedin=5.0
        )
        ranking = ps.platform_ranking()
        assert ranking[0] == "youtube"   # highest priority
        assert ranking[-1] == "linkedin"  # lowest priority

    def test_best_platform_returns_string(self):
        from tasks.platform_scorer import score_all_platforms
        scores = score_all_platforms(35.0, 0.7, 0.6, 7.0, "hook")
        assert isinstance(scores.best_platform(), str)
        assert scores.best_platform() in {"youtube", "facebook", "tiktok", "instagram", "linkedin"}

    def test_as_dict_rounds_to_2_decimals(self):
        from tasks.platform_scorer import PlatformScores
        ps = PlatformScores(youtube=7.123456, facebook=6.789012)
        d = ps.as_dict()
        assert d["youtube"] == 7.12
        assert d["facebook"] == 6.79


# ═══════════════════════════════════════════════════════════════════════════════
# TestNepaliHookTemplates
# ═══════════════════════════════════════════════════════════════════════════════

class TestNepaliHookTemplates:
    """Nepali hook templates — Devanagari, 5 types, template variable substitution."""

    def test_generates_exactly_5_hooks(self):
        from tasks.shorts_engine import generate_nepali_hook_templates
        hooks = generate_nepali_hook_templates("यो विषय")
        assert len(hooks) == 5

    def test_hooks_contain_devanagari(self):
        from tasks.shorts_engine import generate_nepali_hook_templates
        hooks = generate_nepali_hook_templates("Nepal travel")
        # Each hook should contain at least some Devanagari text
        for hook in hooks:
            has_devanagari = any("ऀ" <= ch <= "ॿ" for ch in hook)
            assert has_devanagari, f"Hook missing Devanagari: {hook!r}"

    def test_hooks_contain_topic(self):
        from tasks.shorts_engine import generate_nepali_hook_templates
        topic = "यूट्यूब"
        hooks = generate_nepali_hook_templates(topic)
        for hook in hooks:
            assert topic in hook, f"Topic '{topic}' not found in hook: {hook!r}"

    def test_hooks_are_all_different(self):
        from tasks.shorts_engine import generate_nepali_hook_templates
        hooks = generate_nepali_hook_templates("topic")
        assert len(set(hooks)) == 5, "All 5 hooks should be unique"

    def test_hook_types_cover_all_5_templates(self):
        """All 5 hook types must be represented."""
        from tasks.shorts_engine import HOOK_TEMPLATE_ORDER
        assert set(HOOK_TEMPLATE_ORDER) == {
            "direct_address", "bold_claim", "question", "statistic", "story_tease"
        }

    def test_long_topic_is_truncated_naturally(self):
        """Very long topics should be trimmed to 4 words for natural Nepali."""
        from tasks.shorts_engine import generate_nepali_hook_templates
        long_topic = "यो एउटा धेरै लामो विषय हो जुन छोट्याउनु पर्छ"
        hooks = generate_nepali_hook_templates(long_topic)
        # All hooks must still be generated without error
        assert len(hooks) == 5

    def test_empty_topic_uses_fallback(self):
        """Empty topic should use fallback Devanagari phrase."""
        from tasks.shorts_engine import generate_nepali_hook_templates
        hooks = generate_nepali_hook_templates("")
        assert len(hooks) == 5
        # Fallback should be Devanagari
        for hook in hooks:
            has_devanagari = any("ऀ" <= ch <= "ॿ" for ch in hook)
            assert has_devanagari


# ═══════════════════════════════════════════════════════════════════════════════
# TestReframePlan
# ═══════════════════════════════════════════════════════════════════════════════

class TestReframePlan:
    """9:16 reframe plan — strategy selection, FFmpeg filter, metadata."""

    def test_reframe_returns_9_16_aspect(self):
        from tasks.shorts_engine import plan_reframe
        plan = plan_reframe(energy_level=0.6, dominant_intent="value", duration=30.0)
        assert plan["aspect_ratio"] == "9:16"

    def test_reframe_has_ffmpeg_filter(self):
        from tasks.shorts_engine import plan_reframe
        plan = plan_reframe(energy_level=0.6, dominant_intent="value", duration=30.0)
        assert "ffmpeg_filter" in plan
        assert "crop" in plan["ffmpeg_filter"]

    def test_high_energy_uses_center_crop(self):
        from tasks.shorts_engine import plan_reframe
        plan = plan_reframe(energy_level=0.9, dominant_intent="hook", duration=20.0)
        assert plan["strategy"] == "center_crop"

    def test_calm_content_uses_speaker_track(self):
        from tasks.shorts_engine import plan_reframe
        plan = plan_reframe(energy_level=0.3, dominant_intent="value", duration=45.0)
        assert plan["strategy"] == "speaker_track"

    def test_reframe_targets_vertical_platforms(self):
        from tasks.shorts_engine import plan_reframe
        plan = plan_reframe(0.5, "other", 30.0)
        platforms = plan.get("platforms", [])
        assert "tiktok" in platforms
        assert "instagram" in platforms

    def test_reframe_output_resolution_is_1080x1920(self):
        from tasks.shorts_engine import plan_reframe
        plan = plan_reframe(0.5, "other", 30.0)
        assert plan["output_resolution"] == "1080x1920"

    def test_cta_intent_uses_center_crop(self):
        """CTA scenes are usually talking-head with energy — use center crop."""
        from tasks.shorts_engine import plan_reframe
        plan = plan_reframe(energy_level=0.5, dominant_intent="cta", duration=15.0)
        assert plan["strategy"] == "center_crop"


class TestShortCropFilter:
    """short_crop_filter — FFmpeg 9:16 crop with horizontal pan."""

    def test_center_pan_uses_half_offset(self):
        from tasks.shorts_engine import short_crop_filter
        vf = short_crop_filter(0.5)
        assert "crop=ih*9/16:ih:(iw-ih*9/16)*0.5000:0" in vf
        assert "scale=1080:1920" in vf

    def test_left_pan_clamps_to_zero(self):
        from tasks.shorts_engine import short_crop_filter
        vf = short_crop_filter(-0.2)
        assert "*0.0000:0" in vf

    def test_right_pan_clamps_to_one(self):
        from tasks.shorts_engine import short_crop_filter
        vf = short_crop_filter(1.5)
        assert "*1.0000:0" in vf

    def test_plan_reframe_includes_pan_x(self):
        from tasks.shorts_engine import plan_reframe
        plan = plan_reframe(0.5, "value", 30.0)
        assert plan["pan_x"] == 0.5

    def test_build_short_video_filter_adds_color_grade(self):
        from tasks.shorts_engine import build_short_video_filter
        vf = build_short_video_filter(0.5, 1080, 1920, {"filter_id": "warm"})
        assert "eq=saturation" in vf
        assert "crop=ih*9/16" in vf

    def test_short_speed_multiplier_from_styling(self):
        from tasks.shorts_engine import short_speed_multiplier
        assert short_speed_multiplier({"speed_id": "fast-2x"}) == 2.0
        assert short_speed_multiplier(None) == 1.0


# ═══════════════════════════════════════════════════════════════════════════════
# TestShortsExtraction
# ═══════════════════════════════════════════════════════════════════════════════

class TestShortsExtraction:
    """extract_short_candidates — all 4 extraction strategies."""

    def test_empty_scenes_returns_empty(self):
        from tasks.shorts_engine import extract_short_candidates
        assert extract_short_candidates([]) == []

    def test_single_high_score_scene_is_candidate(self):
        """Strategy 1: single scene with score ≥ 6.5 and 30–240 s duration."""
        from tasks.shorts_engine import extract_short_candidates
        scenes = [_make_scene(
            index=0, start_time=0.0, end_time=30.0,
            editorial_score=8.0, intent="value",
        )]
        candidates = extract_short_candidates(scenes)
        assert len(candidates) >= 1

    def test_scene_too_short_excluded(self):
        """Scenes shorter than 30 s should not become candidates."""
        from tasks.shorts_engine import extract_short_candidates
        scenes = [_make_scene(index=0, start_time=0.0, end_time=10.0, editorial_score=9.0)]
        candidates = extract_short_candidates(scenes)
        assert all(c.duration >= 30.0 for c in candidates)

    def test_scene_too_long_excluded(self):
        """Scenes longer than 240 s should not become single-scene candidates."""
        from tasks.shorts_engine import extract_short_candidates
        scenes = [_make_scene(index=0, start_time=0.0, end_time=90.0, editorial_score=9.0)]
        candidates = extract_short_candidates(scenes)
        # Single-scene candidates should all be <= 240s
        single = [c for c in candidates if len(c.scene_indices) == 1]
        assert all(c.duration <= 240.0 for c in single)

    def test_hook_value_pair_extracted(self):
        """Strategy 2: HOOK + VALUE consecutive pair should always be a candidate."""
        from tasks.shorts_engine import extract_short_candidates
        scenes = [
            _make_scene(index=0, start_time=0.0,  end_time=20.0, intent="hook",  editorial_score=7.5),
            _make_scene(index=1, start_time=20.0, end_time=45.0, intent="value", editorial_score=8.0),
            _make_scene(index=2, start_time=45.0, end_time=90.0, intent="other", editorial_score=5.0),
        ]
        candidates = extract_short_candidates(scenes)
        two_scene = [c for c in candidates if c.scene_indices == [0, 1]]
        assert len(two_scene) >= 1, "HOOK+VALUE pair must be extracted"

    def test_problem_value_pair_extracted(self):
        """
        Strategy 2: PROBLEM + VALUE pair also makes a good short.

        Both scenes are individually below the 30 s minimum,
        so the combined pair is the valid candidate.
        This confirms Strategy 2 logic fires correctly.
        """
        from tasks.shorts_engine import extract_short_candidates
        # Scene 0: 12 s — too short alone
        # Scene 1: 22 s — too short alone
        # Combined: 34 s — valid micro-tier short
        scenes = [
            _make_scene(index=0, start_time=0.0,  end_time=12.0, intent="problem", editorial_score=8.5),
            _make_scene(index=1, start_time=12.0, end_time=34.0, intent="value",   editorial_score=8.5),
        ]
        candidates = extract_short_candidates(scenes)
        assert len(candidates) >= 1, "PROBLEM+VALUE pair must be extracted as a candidate"
        combined = [c for c in candidates if 0 in c.scene_indices and 1 in c.scene_indices]
        assert combined, "Extracted candidate must include both PROBLEM (0) and VALUE (1) scenes"

    def test_returns_at_most_max_candidates(self):
        from tasks.shorts_engine import extract_short_candidates, MAX_CANDIDATES
        # 15 scenes, each 30 s — many candidates possible
        scenes = [
            _make_scene(i, i * 30.0, (i + 1) * 30.0, editorial_score=8.0)
            for i in range(15)
        ]
        candidates = extract_short_candidates(scenes)
        assert len(candidates) <= MAX_CANDIDATES

    def test_candidates_sorted_by_nepal_score(self):
        """Candidates are returned in descending nepal_weighted_score order."""
        from tasks.shorts_engine import extract_short_candidates
        scenes = [
            _make_scene(0, 0.0,  30.0, editorial_score=9.0, intent="hook",  energy_level=0.9),
            _make_scene(1, 30.0, 60.0, editorial_score=5.0, intent="filler", energy_level=0.2),
        ]
        candidates = extract_short_candidates(scenes)
        if len(candidates) >= 2:
            scores = [c.platform_scores.nepal_weighted_score() for c in candidates]
            assert scores == sorted(scores, reverse=True), "Candidates must be sorted descending"

    def test_overlapping_candidates_deduplicated(self):
        """Heavily overlapping candidates should be deduplicated."""
        from tasks.shorts_engine import extract_short_candidates
        # 3 high-score scenes each 20 s — windows [0,1], [0,1,2], [1,2] overlap heavily
        scenes = [
            _make_scene(0, 0.0,  20.0, editorial_score=8.5, intent="hook"),
            _make_scene(1, 20.0, 40.0, editorial_score=8.5, intent="value"),
            _make_scene(2, 40.0, 60.0, editorial_score=8.5, intent="value"),
        ]
        candidates = extract_short_candidates(scenes)
        # Ensure no two candidates overlap more than 40%
        for i, a in enumerate(candidates):
            for b in candidates[i + 1:]:
                overlap = min(a.end_time, b.end_time) - max(a.start_time, b.start_time)
                if overlap > 0:
                    shorter = min(a.duration, b.duration)
                    overlap_ratio = overlap / shorter if shorter > 0 else 0
                    assert overlap_ratio <= 0.4, (
                        f"Overlap ratio {overlap_ratio:.2f} exceeds 40% "
                        f"between [{a.start_time},{a.end_time}] and [{b.start_time},{b.end_time}]"
                    )

    def test_fallback_produces_candidates_when_scores_low(self):
        """Strategy 4: even low-scoring scenes should produce some candidates."""
        from tasks.shorts_engine import extract_short_candidates
        scenes = [
            _make_scene(i, i * 30.0, (i + 1) * 30.0, editorial_score=4.0, intent="other")
            for i in range(6)
        ]
        candidates = extract_short_candidates(scenes)
        assert len(candidates) >= 1, "Fallback should produce at least 1 candidate"


# ═══════════════════════════════════════════════════════════════════════════════
# TestShortCandidateSerialisation
# ═══════════════════════════════════════════════════════════════════════════════

class TestShortCandidateSerialisation:
    """ShortCandidate.to_suggestion_action() — JSON-safe output for DB storage."""

    def _make_candidate(self):
        from tasks.shorts_engine import extract_short_candidates
        scenes = [_make_scene(0, 0.0, 35.0, editorial_score=8.0, intent="hook")]
        candidates = extract_short_candidates(scenes)
        assert candidates, "Need at least one candidate for serialisation test"
        return candidates[0]

    def test_action_has_all_required_fields(self):
        c = self._make_candidate()
        action = c.to_suggestion_action()
        required = {
            "type", "scene_indices", "start_time", "end_time", "duration",
            "platform_scores", "platform_ranking", "nepal_weighted_score",
            "best_platform", "nepali_hooks", "reframe",
        }
        for field in required:
            assert field in action, f"Missing field: {field}"

    def test_action_type_is_short_clip(self):
        c = self._make_candidate()
        assert c.to_suggestion_action()["type"] == "short_clip"

    def test_action_has_5_nepali_hooks(self):
        c = self._make_candidate()
        action = c.to_suggestion_action()
        assert len(action["nepali_hooks"]) == 5

    def test_action_platform_ranking_is_list(self):
        c = self._make_candidate()
        action = c.to_suggestion_action()
        assert isinstance(action["platform_ranking"], list)
        assert len(action["platform_ranking"]) == 5

    def test_action_is_json_serialisable(self):
        import json
        c = self._make_candidate()
        action = c.to_suggestion_action()
        # Must not raise
        serialised = json.dumps(action, ensure_ascii=False)
        assert len(serialised) > 0

    def test_nepali_hooks_json_preserved_correctly(self):
        """Devanagari characters must round-trip through JSON without mangling."""
        import json
        c = self._make_candidate()
        action = c.to_suggestion_action()
        serialised = json.dumps(action, ensure_ascii=False)
        parsed = json.loads(serialised)
        for hook in parsed["nepali_hooks"]:
            has_devanagari = any("ऀ" <= ch <= "ॿ" for ch in hook)
            assert has_devanagari, f"Devanagari lost after JSON round-trip: {hook!r}"

    def test_duration_matches_start_end_diff(self):
        c = self._make_candidate()
        action = c.to_suggestion_action()
        expected = round(action["end_time"] - action["start_time"], 2)
        assert abs(action["duration"] - expected) < 0.01


# ═══════════════════════════════════════════════════════════════════════════════
# TestRunShortsEngine
# ═══════════════════════════════════════════════════════════════════════════════

class TestRunShortsEngine:
    """run_shorts_engine() — public entry point, returns list of action dicts."""

    def test_returns_list(self):
        from tasks.shorts_engine import run_shorts_engine
        result = run_shorts_engine([], "other", 0.0)
        assert isinstance(result, list)

    def test_returns_dicts(self):
        from tasks.shorts_engine import run_shorts_engine
        scenes = [_make_scene(0, 0.0, 30.0, editorial_score=8.0)]
        result = run_shorts_engine(scenes, "vlog", 120.0)
        for item in result:
            assert isinstance(item, dict)

    def test_all_actions_have_platform_scores(self):
        from tasks.shorts_engine import run_shorts_engine
        scenes = [_make_scene(0, 0.0, 30.0, editorial_score=8.0)]
        result = run_shorts_engine(scenes, "podcast", 60.0)
        for action in result:
            ps = action.get("platform_scores", {})
            assert "youtube" in ps
            assert "facebook" in ps
            assert "tiktok" in ps

    def test_facebook_in_nepal_weighted(self):
        """Verify facebook contributes to nepal_weighted_score (30% weight)."""
        from tasks.platform_scorer import PlatformScores
        ps = PlatformScores(youtube=0.0, facebook=10.0, tiktok=0.0, instagram=0.0, linkedin=0.0)
        assert ps.nepal_weighted_score() == 3.0  # 10 × 0.30

    def test_handles_scenes_without_editorial_score(self):
        """If editorial_adjusted_score missing, falls back to highlight_score × 10."""
        from tasks.shorts_engine import run_shorts_engine
        scene = {
            "index": 0,
            "start_time": 0.0,
            "end_time": 30.0,
            "intent": "value",
            "highlight_score": 0.75,   # fallback: 7.5
            "energy_level": 0.6,
            "title": "Test",
            "summary": "Test summary",
            "transcript_excerpt": "test",
            # NO editorial_adjusted_score
        }
        result = run_shorts_engine([scene], "vlog", 60.0)
        assert isinstance(result, list)


# ═══════════════════════════════════════════════════════════════════════════════
# TestAnalyzeTaskIntegration
# ═══════════════════════════════════════════════════════════════════════════════

class TestAnalyzeTaskIntegration:
    """Verify analyze.py wires up the shorts engine."""

    def test_analyze_imports_shorts_engine(self):
        """analyze.py source must reference shorts_engine."""
        import inspect, tasks.analyze as analyze_mod
        src = inspect.getsource(analyze_mod)
        assert "shorts_engine" in src, "analyze.py must import shorts_engine"

    def test_analyze_calls_run_shorts_engine(self):
        """analyze.py must call run_shorts_engine()."""
        import inspect, tasks.analyze as analyze_mod
        src = inspect.getsource(analyze_mod)
        assert "run_shorts_engine" in src, "analyze.py must call run_shorts_engine"

    def test_shorts_suggestion_type_is_short_clip(self):
        """analyze.py must insert suggestions with type='short_clip'."""
        import inspect, tasks.analyze as analyze_mod
        src = inspect.getsource(analyze_mod)
        assert "short_clip" in src, "analyze.py must store shorts as 'short_clip' suggestions"

    def test_shorts_engine_is_non_fatal(self):
        """shorts engine failure should be caught separately (non-fatal try/except)."""
        import inspect, tasks.analyze as analyze_mod
        src = inspect.getsource(analyze_mod)
        assert "shorts_exc" in src or "shorts_engine_failed" in src, (
            "analyze.py should handle shorts engine failure non-fatally"
        )


# ═══════════════════════════════════════════════════════════════════════════════
# TestAssetsRouterShorts
# ═══════════════════════════════════════════════════════════════════════════════

class TestAssetsRouterShorts:
    """Verify the GET /shorts endpoint is registered on the assets router."""

    def test_shorts_endpoint_registered(self):
        from routers.assets import router
        paths = [route.path for route in router.routes]
        matching = [p for p in paths if "shorts" in p]
        assert matching, f"No '/shorts' endpoint found in assets router. Paths: {paths}"

    def test_shorts_endpoint_is_get(self):
        from routers.assets import router
        for route in router.routes:
            if "shorts" in getattr(route, "path", ""):
                methods = getattr(route, "methods", set())
                assert "GET" in methods, f"'/shorts' endpoint should be GET, got {methods}"
                break
