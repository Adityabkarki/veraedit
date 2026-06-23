"""
Tests for EP-2.3 — Scene Detection & Analysis (Nepali)

Covers:
  - Nepali intent pattern detection
  - Audio intelligence (silence, filler, breath detection)
  - Editorial engine (content-type profiles, J/L-cut planning)
  - Hook generation plumbing (prompt content, pick_best_hook)
  - analyze.py task integration (updated pipeline)
"""
from __future__ import annotations

import pytest
import sys
import os

# Ensure the api package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../apps/api"))


# ─────────────────────────────────────────────────────────────────────────────
# Intent Detection Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestSceneIntentDetection:

    def test_nepali_direct_address_is_hook(self):
        from tasks.intent import detect_scene_intent, SceneIntent
        result = detect_scene_intent("साथीहरू, आज म तपाईंलाई एउटा महत्त्वपूर्ण कुरा बताउँछु।")
        assert result == SceneIntent.HOOK

    def test_nepali_namaste_is_hook(self):
        from tasks.intent import detect_scene_intent, SceneIntent
        result = detect_scene_intent("नमस्ते सबैलाई! यो भिडियोमा हामी...")
        assert result == SceneIntent.HOOK

    def test_english_guys_is_hook(self):
        from tasks.intent import detect_scene_intent, SceneIntent
        result = detect_scene_intent("What's up guys, welcome back to the channel!")
        assert result == SceneIntent.HOOK

    def test_subscribe_is_cta(self):
        from tasks.intent import detect_scene_intent, SceneIntent
        result = detect_scene_intent("Please subscribe to the channel and hit the bell icon.")
        assert result == SceneIntent.CTA

    def test_nepali_cta_detected(self):
        from tasks.intent import detect_scene_intent, SceneIntent
        result = detect_scene_intent("यो भिडियो मनपरेको छ भने like गर्नुहोस् र share गर्नुहोस्।")
        assert result == SceneIntent.CTA

    def test_problem_detected(self):
        from tasks.intent import detect_scene_intent, SceneIntent
        result = detect_scene_intent("यो एउटा ठूलो समस्या हो जुन धेरैले सामना गर्छन्।")
        assert result == SceneIntent.PROBLEM

    def test_tutorial_value_detected(self):
        from tasks.intent import detect_scene_intent, SceneIntent
        result = detect_scene_intent("Step 1: First, open your laptop and go to settings.")
        assert result == SceneIntent.VALUE

    def test_nepali_value_detected(self):
        from tasks.intent import detect_scene_intent, SceneIntent
        result = detect_scene_intent("यो काम गर्ने तरिका यस्तो छ। पहिलो चरणमा तपाईंले...")
        assert result == SceneIntent.VALUE

    def test_personal_story_detected(self):
        from tasks.intent import detect_scene_intent, SceneIntent
        result = detect_scene_intent("मैले एक दिन यो अनुभव गरें जुन मलाई सधैं याद रहन्छ।")
        assert result == SceneIntent.STORY

    def test_heavy_filler_is_filler_intent(self):
        from tasks.intent import detect_scene_intent, SceneIntent
        # 3 out of 6 tokens are filler words → filler_density = 0.5 > 0.25
        result = detect_scene_intent("उम आ भनेको यो त्यो उम उम")
        assert result == SceneIntent.FILLER

    def test_empty_string_is_other(self):
        from tasks.intent import detect_scene_intent, SceneIntent
        result = detect_scene_intent("")
        assert result == SceneIntent.OTHER

    def test_none_like_empty_is_other(self):
        from tasks.intent import detect_scene_intent, SceneIntent
        result = detect_scene_intent("   ")
        assert result == SceneIntent.OTHER

    def test_classify_scenes_adds_intent_field(self):
        from tasks.intent import classify_scenes
        scenes = [
            {"transcript_excerpt": "साथीहरू, नमस्ते!", "summary": "Intro"},
            {"transcript_excerpt": "Please subscribe!", "summary": "CTA"},
        ]
        result = classify_scenes(scenes)
        assert "intent" in result[0]
        assert "intent" in result[1]
        assert result[0]["intent"] == "hook"
        assert result[1]["intent"] == "cta"

    def test_classify_scenes_uses_summary_fallback(self):
        """If transcript_excerpt is missing, use summary."""
        from tasks.intent import classify_scenes
        scenes = [{"summary": "साथीहरू, नमस्ते!"}]
        result = classify_scenes(scenes)
        assert result[0]["intent"] == "hook"

    def test_cta_priority_over_hook(self):
        """CTA patterns take priority even if hook patterns also match."""
        from tasks.intent import detect_scene_intent, SceneIntent
        # Both "guys" (hook) and "subscribe" (CTA) present — CTA wins
        result = detect_scene_intent("Hey guys, please subscribe to the channel!")
        assert result == SceneIntent.CTA

    def test_filler_words_include_nepali(self):
        """Ensure Nepali filler words are in the FILLER_WORDS set."""
        from tasks.audio_intel import NEPALI_FILLER_WORDS
        nepali_fillers = {"उम", "आ", "हैन", "भनेको"}
        for filler in nepali_fillers:
            assert filler in NEPALI_FILLER_WORDS, f"'{filler}' should be in NEPALI_FILLER_WORDS"


# ─────────────────────────────────────────────────────────────────────────────
# Audio Intelligence Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestAudioIntelligence:

    def _make_words(self, entries: list[tuple[str, float, float]]) -> list[dict]:
        """Helper: create word dicts from (word, start, end) tuples."""
        return [{"word": w, "start": s, "end": e} for w, s, e in entries]

    def test_silence_detected_between_words(self):
        from tasks.audio_intel import analyze_audio_intelligence
        words = self._make_words([
            ("नमस्ते", 0.0, 0.5),
            ("साथीहरू", 2.0, 2.5),  # 1.5s gap → silence
        ])
        report = analyze_audio_intelligence(words, total_duration=3.0)
        assert report.silence_count == 1
        assert report.silences[0].duration == pytest.approx(1.5, abs=0.01)

    def test_short_gap_not_silence(self):
        from tasks.audio_intel import analyze_audio_intelligence
        words = self._make_words([
            ("hello", 0.0, 0.3),
            ("world", 0.4, 0.7),  # 0.1s gap → not a silence
        ])
        report = analyze_audio_intelligence(words, total_duration=1.0)
        assert report.silence_count == 0

    def test_nepali_filler_detected(self):
        from tasks.audio_intel import analyze_audio_intelligence
        words = self._make_words([
            ("उम", 1.0, 1.3),
            ("आ", 2.0, 2.2),
        ])
        report = analyze_audio_intelligence(words, total_duration=3.0)
        assert report.filler_count == 2
        assert any(f.language == "ne" for f in report.fillers)

    def test_english_filler_detected(self):
        from tasks.audio_intel import analyze_audio_intelligence
        words = self._make_words([
            ("um", 0.5, 0.8),
            ("the", 1.0, 1.2),
            ("uh", 1.5, 1.7),
        ])
        report = analyze_audio_intelligence(words, total_duration=2.0)
        assert report.filler_count == 2
        assert all(f.language == "en" for f in report.fillers)

    def test_breath_marker_detected(self):
        from tasks.audio_intel import analyze_audio_intelligence, BREATH_MAX_DURATION_S
        # A word lasting only 0.08s is a breath
        words = self._make_words([
            ("ha", 0.0, 0.08),
            ("नमस्ते", 0.5, 1.0),
        ])
        report = analyze_audio_intelligence(words, total_duration=1.0)
        assert len(report.breaths) == 1
        assert report.breaths[0].duration <= BREATH_MAX_DURATION_S

    def test_empty_words_returns_zero_report(self):
        from tasks.audio_intel import analyze_audio_intelligence
        report = analyze_audio_intelligence([], total_duration=60.0)
        assert report.silence_count == 0
        assert report.filler_count == 0
        assert report.speech_ratio == 1.0

    def test_speech_ratio_with_silences(self):
        from tasks.audio_intel import analyze_audio_intelligence
        words = self._make_words([
            ("hello", 0.0, 0.5),
            ("world", 5.0, 5.5),  # 4.5s silence in a 6s clip
        ])
        report = analyze_audio_intelligence(words, total_duration=6.0)
        # silence = 4.5s out of 6s → speech ~= 1 - 4.5/6 = 0.25
        assert report.speech_ratio < 0.5

    def test_to_dict_is_json_serialisable(self):
        """Report must serialise to JSON (Devanagari preserved)."""
        import json
        from tasks.audio_intel import analyze_audio_intelligence
        words = self._make_words([("उम", 0.0, 0.3)])
        report = analyze_audio_intelligence(words, 5.0)
        data = report.to_dict()
        serialised = json.dumps(data, ensure_ascii=False)
        assert "उम" in serialised

    def test_plan_silence_cuts_filters_short_gaps(self):
        from tasks.audio_intel import analyze_audio_intelligence, plan_silence_cuts
        words = self._make_words([
            ("a", 0.0, 0.1),
            ("b", 1.0, 1.1),   # 0.9s gap — below 1.5s min_duration
            ("c", 5.0, 5.1),   # 3.9s gap — above min_duration → cut
        ])
        report = analyze_audio_intelligence(words, 6.0)
        cuts = plan_silence_cuts(report, min_duration=1.5)
        assert len(cuts) == 1
        assert cuts[0]["type"] == "silence_cut"

    def test_plan_filler_cuts_groups_consecutive(self):
        from tasks.audio_intel import analyze_audio_intelligence, plan_filler_cuts
        words = self._make_words([
            ("um", 1.0, 1.3),
            ("uh", 1.4, 1.6),  # close together — should be grouped
            ("hello", 3.0, 3.5),
            ("um", 5.0, 5.3),  # separate group
        ])
        report = analyze_audio_intelligence(words, 6.0)
        cuts = plan_filler_cuts(report, group_gap_s=0.5)
        assert len(cuts) == 2  # two groups

    def test_silence_threshold_constant(self):
        """Threshold must be >= 0.5s to avoid false positives."""
        from tasks.audio_intel import SILENCE_THRESHOLD_S
        assert SILENCE_THRESHOLD_S >= 0.5


# ─────────────────────────────────────────────────────────────────────────────
# Editorial Engine Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestEditorialEngine:

    def _make_scene(
        self,
        index: int,
        start: float,
        end: float,
        intent: str = "other",
        is_highlight: bool = False,
        shorts_score: float = 5.0,
    ) -> dict:
        return {
            "index": index,
            "start_time": start,
            "end_time": end,
            "intent": intent,
            "is_highlight": is_highlight,
            "platform_scores": {
                "youtube": 5.0,
                "shorts": shorts_score,
                "tiktok": 5.0,
                "instagram": 5.0,
            },
        }

    def test_all_content_profiles_exist(self):
        from tasks.editorial import CONTENT_PROFILES
        for content_type in ["podcast", "tutorial", "vlog", "shorts", "interview", "other"]:
            assert content_type in CONTENT_PROFILES

    def test_value_scene_boosted_in_tutorial(self):
        from tasks.editorial import adjust_scene_scores
        scenes = [self._make_scene(0, 0, 60, intent="value", shorts_score=5.0)]
        result = adjust_scene_scores(scenes, "tutorial", 7.0)
        # Tutorial boosts value scenes (1.4x) → 5.0 * 1.4 = 7.0
        assert result[0]["editorial_adjusted_score"] > 5.0

    def test_hook_scene_boosted_in_vlog(self):
        from tasks.editorial import adjust_scene_scores
        scenes = [self._make_scene(0, 0, 60, intent="hook", shorts_score=5.0)]
        result = adjust_scene_scores(scenes, "vlog", 7.0)
        assert result[0]["editorial_adjusted_score"] > 5.0

    def test_filler_scene_penalised_in_podcast(self):
        from tasks.editorial import adjust_scene_scores
        scenes = [self._make_scene(0, 0, 60, intent="filler", shorts_score=6.0)]
        result = adjust_scene_scores(scenes, "podcast", 7.0)
        # filler penalty 0.5x → 6.0 * 0.5 = 3.0
        assert result[0]["editorial_adjusted_score"] < 6.0

    def test_too_short_scene_penalised(self):
        from tasks.editorial import adjust_scene_scores
        # podcast ideal_min = 30s; this scene is only 10s
        # Use "other" intent so no boost applies — only the short-scene penalty (0.8×)
        # 6.0 * 0.8 = 4.8 < 6.0
        scenes = [self._make_scene(0, 0, 10, intent="other", shorts_score=6.0)]
        result = adjust_scene_scores(scenes, "podcast", 7.0)
        # Penalised by 0.8x → 4.8
        assert result[0]["editorial_adjusted_score"] < 6.0

    def test_too_long_scene_penalised(self):
        from tasks.editorial import adjust_scene_scores
        # shorts ideal_max = 60s; this scene is 120s
        scenes = [self._make_scene(0, 0, 120, intent="hook", shorts_score=8.0)]
        result = adjust_scene_scores(scenes, "shorts", 7.0)
        # penalty = 60/120 = 0.5x; after hook boost (1.5x): 8 * 1.5 * 0.5 = 6.0
        assert result[0]["editorial_adjusted_score"] <= 8.0

    def test_score_clamped_between_0_and_10(self):
        from tasks.editorial import adjust_scene_scores
        scenes = [self._make_scene(0, 0, 30, intent="hook", shorts_score=9.0)]
        result = adjust_scene_scores(scenes, "shorts", 10.0)
        assert 0.0 <= result[0]["editorial_adjusted_score"] <= 10.0

    def test_qualifies_for_short_set_correctly(self):
        from tasks.editorial import adjust_scene_scores
        high_scene = [self._make_scene(0, 0, 30, intent="hook", shorts_score=9.5)]
        low_scene = [self._make_scene(0, 0, 30, intent="filler", shorts_score=2.0)]
        adjust_scene_scores(high_scene, "vlog", 8.0)
        adjust_scene_scores(low_scene, "vlog", 3.0)
        assert high_scene[0]["qualifies_for_short"] is True
        assert low_scene[0]["qualifies_for_short"] is False

    def test_cta_check_finds_cta_scene(self):
        from tasks.editorial import check_cta_presence
        scenes = [
            {"intent": "hook"},
            {"intent": "value"},
            {"intent": "cta"},
        ]
        result = check_cta_presence(scenes, "podcast")
        assert result["has_cta"] is True
        assert result["cta_scene_index"] == 2

    def test_cta_check_recommends_when_missing(self):
        from tasks.editorial import check_cta_presence
        scenes = [{"intent": "hook"}, {"intent": "value"}]
        result = check_cta_presence(scenes, "podcast")  # podcast expects CTA
        assert result["has_cta"] is False
        assert result["recommendation"] != ""

    def test_cta_not_required_for_vlog(self):
        from tasks.editorial import check_cta_presence
        scenes = [{"intent": "hook"}, {"intent": "story"}]
        result = check_cta_presence(scenes, "vlog")
        assert result["has_cta"] is False
        assert result["recommendation"] == ""  # vlog doesn't require CTA

    def test_jl_cuts_planned_between_hook_and_value(self):
        from tasks.editorial import plan_jl_cuts
        scenes = [
            self._make_scene(0, 0.0, 30.0, intent="hook"),
            self._make_scene(1, 30.0, 90.0, intent="value"),
        ]
        cuts = plan_jl_cuts(scenes, "tutorial")
        assert len(cuts) >= 1
        assert cuts[0]["cut_type"] == "j_cut"

    def test_jl_cuts_empty_for_single_scene(self):
        from tasks.editorial import plan_jl_cuts
        scenes = [self._make_scene(0, 0.0, 60.0, intent="hook")]
        cuts = plan_jl_cuts(scenes, "podcast")
        assert cuts == []

    def test_editorial_notes_populated(self):
        from tasks.editorial import adjust_scene_scores
        scenes = [self._make_scene(0, 0, 30, intent="value", shorts_score=5.0)]
        result = adjust_scene_scores(scenes, "tutorial", 7.0)
        assert isinstance(result[0]["editorial_notes"], list)


# ─────────────────────────────────────────────────────────────────────────────
# Hook Generation Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestHookGeneration:

    def test_hook_system_prompt_mentions_nepali(self):
        from tasks.hooks import _HOOK_SYSTEM
        assert "Nepali" in _HOOK_SYSTEM

    def test_hook_system_prompt_specifies_devanagari(self):
        from tasks.hooks import _HOOK_SYSTEM
        assert "Devanagari" in _HOOK_SYSTEM

    def test_hook_user_prompt_template_has_placeholders(self):
        from tasks.hooks import _HOOK_USER
        formatted = _HOOK_USER.format(
            topic="Technology",
            current_opening="नमस्ते",
            best_moment="exciting climax",
            duration=300.0,
        )
        assert "Technology" in formatted
        assert "नमस्ते" in formatted

    def test_hook_user_prompt_requests_five_types(self):
        from tasks.hooks import _HOOK_USER
        for hook_type in ["direct_address", "bold_claim", "question", "statistic", "story_tease"]:
            assert hook_type in _HOOK_USER

    def test_pick_best_hook_returns_highest_score(self):
        from tasks.hooks import pick_best_hook
        hooks = [
            {"type": "direct_address", "estimated_retention_boost": 0.10, "nepali": "साथीहरू"},
            {"type": "bold_claim", "estimated_retention_boost": 0.25, "nepali": "यो"},
            {"type": "question", "estimated_retention_boost": 0.15, "nepali": "के"},
        ]
        best = pick_best_hook(hooks)
        assert best["type"] == "bold_claim"
        assert best["estimated_retention_boost"] == 0.25

    def test_pick_best_hook_empty_raises(self):
        from tasks.hooks import pick_best_hook
        with pytest.raises(ValueError):
            pick_best_hook([])

    def test_hook_prompt_output_in_nepali(self):
        """The hook output JSON example uses Nepali text."""
        from tasks.hooks import _HOOK_USER
        # The template example hook must have Devanagari
        assert "साथीहरू" in _HOOK_USER


# ─────────────────────────────────────────────────────────────────────────────
# Analyze task integration tests
# ─────────────────────────────────────────────────────────────────────────────

class TestAnalyzeTaskIntegration:

    def test_analyze_task_registered(self):
        from celery_app import celery_app
        import tasks.analyze  # noqa — importing registers the task
        assert "tasks.analyze.run" in celery_app.tasks

    def test_analyze_task_includes_audio_intel_imports(self):
        """analyze.py must import from audio_intel."""
        import inspect
        import tasks.analyze as m
        src = inspect.getsource(m)
        assert "audio_intel" in src

    def test_analyze_task_includes_intent_classification(self):
        """analyze.py must call classify_scenes."""
        import inspect
        import tasks.analyze as m
        src = inspect.getsource(m)
        assert "classify_scenes" in src

    def test_analyze_task_includes_editorial_scoring(self):
        """analyze.py must call adjust_scene_scores."""
        import inspect
        import tasks.analyze as m
        src = inspect.getsource(m)
        assert "adjust_scene_scores" in src

    def test_analyze_task_plans_jl_cuts(self):
        """analyze.py must call plan_jl_cuts."""
        import inspect
        import tasks.analyze as m
        src = inspect.getsource(m)
        assert "plan_jl_cuts" in src

    def test_analyze_task_stores_filler_words_in_transcript(self):
        """analyze.py must update transcripts.filler_words."""
        import inspect
        import tasks.analyze as m
        src = inspect.getsource(m)
        assert "filler_words" in src

    def test_analyze_task_generates_silence_cut_suggestions(self):
        """analyze.py must call plan_silence_cuts."""
        import inspect
        import tasks.analyze as m
        src = inspect.getsource(m)
        assert "plan_silence_cuts" in src

    def test_analyze_task_generates_filler_cut_suggestions(self):
        """analyze.py must call plan_filler_cuts."""
        import inspect
        import tasks.analyze as m
        src = inspect.getsource(m)
        assert "plan_filler_cuts" in src

    def test_hooks_endpoint_exists_in_assets_router(self):
        """The /hooks endpoint must be registered."""
        import inspect
        import routers.assets as m
        src = inspect.getsource(m)
        assert "generate_hooks" in src
        assert "/hooks" in src

    def test_fmt_time_formats_correctly(self):
        from tasks.analyze import _fmt_time
        assert _fmt_time(0.0) == "0:00"
        assert _fmt_time(65.0) == "1:05"
        assert _fmt_time(3600.0) == "60:00"

    def test_pipeline_worker_is_solo(self):
        from celery_app import celery_app
        assert celery_app.conf.worker_pool == "solo"
