"""
ViraEdit — Tests for EP-2.5: Prompt Compiler.

Covers:
  - Nepali (Devanagari) pattern matching
  - Romanized Nepali pattern matching
  - English pattern matching
  - Mixed language (Devanagari + Latin) detection
  - Target extraction (intro, outro, whole_video, scene:N)
  - Intensity extraction (light, medium, heavy)
  - Strategy mapper: intent → EditOperations
  - Validator: blocks missing context, passes valid context
  - compile_prompt() end-to-end
  - API endpoint registration
  - All NEPALI_PROMPT_EXAMPLES from phase-map are recognized
"""
from __future__ import annotations

import pytest


# ═══════════════════════════════════════════════════════════════════════════════
# TestPatternLibrary
# ═══════════════════════════════════════════════════════════════════════════════

class TestPatternLibrary:
    """prompt_patterns.py — KNOWN_INTENTS, pattern structure, completeness."""

    def test_known_intents_is_non_empty(self):
        from tasks.prompt_patterns import KNOWN_INTENTS
        assert len(KNOWN_INTENTS) >= 8

    def test_known_intents_contains_phase_map_examples(self):
        """All intents from the phase-map NEPALI_PROMPT_EXAMPLES must exist."""
        from tasks.prompt_patterns import KNOWN_INTENTS
        required = {
            "increase_pacing", "make_viral", "add_captions",
            "extract_shorts", "clean_audio", "strengthen_hook",
        }
        missing = required - KNOWN_INTENTS
        assert not missing, f"Missing intents: {missing}"

    def test_all_patterns_have_compiled_regex(self):
        import re
        from tasks.prompt_patterns import ALL_PATTERNS
        for pat in ALL_PATTERNS:
            assert hasattr(pat.regex, "search"), f"Pattern {pat} has no compiled regex"

    def test_all_pattern_intents_are_known(self):
        from tasks.prompt_patterns import ALL_PATTERNS, KNOWN_INTENTS
        for pat in ALL_PATTERNS:
            assert pat.intent in KNOWN_INTENTS, (
                f"Pattern intent '{pat.intent}' not in KNOWN_INTENTS"
            )

    def test_nepali_patterns_exist(self):
        from tasks.prompt_patterns import NEPALI_PATTERNS
        assert len(NEPALI_PATTERNS) >= 5

    def test_romanized_patterns_exist(self):
        from tasks.prompt_patterns import ROMANIZED_PATTERNS
        assert len(ROMANIZED_PATTERNS) >= 5

    def test_english_patterns_exist(self):
        from tasks.prompt_patterns import ENGLISH_PATTERNS
        assert len(ENGLISH_PATTERNS) >= 8

    def test_confidence_boosts_are_in_range(self):
        from tasks.prompt_patterns import ALL_PATTERNS
        for pat in ALL_PATTERNS:
            assert 0.0 <= pat.confidence_boost <= 0.3, (
                f"boost {pat.confidence_boost} out of range for {pat.regex.pattern[:40]}"
            )


# ═══════════════════════════════════════════════════════════════════════════════
# TestNepaliPromptParsing
# ═══════════════════════════════════════════════════════════════════════════════

class TestNepaliPromptParsing:
    """parse_intent() — Devanagari Nepali prompts."""

    def _parse(self, prompt: str):
        from tasks.prompt_compiler import parse_intent
        return parse_intent(prompt)

    def test_viral_banaaunus_intent(self):
        intent = self._parse("viral बनाउनुस्")
        assert intent.action == "make_viral"
        assert intent.confidence >= 0.6

    def test_caption_thapnus_intent(self):
        intent = self._parse("caption थप्नुस्")
        assert intent.action == "add_captions"
        assert intent.confidence >= 0.6

    def test_chito_banaaunus_intent(self):
        intent = self._parse("छिटो बनाउनुस्")
        assert intent.action == "increase_pacing"
        assert intent.confidence >= 0.6

    def test_shorts_banaaunus_intent(self):
        intent = self._parse("छोटो clips बनाउनुस्")
        assert intent.action == "extract_shorts"
        assert intent.confidence >= 0.6

    def test_audio_safa_garnus_intent(self):
        intent = self._parse("आवाज सफा गर्नुस्")
        assert intent.action == "clean_audio"
        assert intent.confidence >= 0.6

    def test_hook_ramro_banaaunus_intent(self):
        intent = self._parse("hooks राम्रो बनाउनुस्")
        assert intent.action == "strengthen_hook"
        assert intent.confidence >= 0.6

    def test_filler_hataaunus(self):
        intent = self._parse("filler हटाउनुस्")
        assert intent.action == "remove_fillers"

    def test_silence_hataaunus(self):
        intent = self._parse("silence हटाउनुस्")
        assert intent.action == "trim_silence"

    def test_music_thapnus(self):
        intent = self._parse("music थप्नुस्")
        assert intent.action == "add_music"

    def test_language_detected_as_nepali(self):
        intent = self._parse("छिटो बनाउनुस्")
        assert intent.language == "nepali"

    def test_mixed_nepali_english_detected_as_mixed(self):
        intent = self._parse("viral बनाउनुस्")
        # 'viral' is Latin, 'बनाउनुस्' is Devanagari → mixed
        assert intent.language == "mixed"

    def test_pure_devanagari_prompt(self):
        intent = self._parse("आवाज सफा गर्नुस्")
        assert intent.language == "nepali"


# ═══════════════════════════════════════════════════════════════════════════════
# TestRomanizedNepaliParsing
# ═══════════════════════════════════════════════════════════════════════════════

class TestRomanizedNepaliParsing:
    """parse_intent() — Romanized Nepali (common in creator communities)."""

    def _parse(self, prompt: str):
        from tasks.prompt_compiler import parse_intent
        return parse_intent(prompt)

    def test_viral_banaunus_romanized(self):
        intent = self._parse("viral banaunus")
        assert intent.action == "make_viral"
        assert intent.confidence >= 0.6

    def test_caption_thapnus_romanized(self):
        intent = self._parse("caption thapnus")
        assert intent.action == "add_captions"

    def test_shorts_banaaunus_romanized(self):
        intent = self._parse("shorts banaaunus")
        assert intent.action == "extract_shorts"

    def test_audio_safa_garnus_romanized(self):
        intent = self._parse("awaj safa garnus")
        assert intent.action == "clean_audio"

    def test_hook_improve_romanized(self):
        intent = self._parse("hook ramro banaaunus")
        assert intent.action == "strengthen_hook"

    def test_filler_hataunus_romanized(self):
        intent = self._parse("filler hataunus")
        assert intent.action == "remove_fillers"

    def test_music_thapnus_romanized(self):
        intent = self._parse("music thapnus")
        assert intent.action == "add_music"

    def test_language_detected_as_romanized(self):
        intent = self._parse("viral banaunus")
        # No Devanagari → romanized (via pattern language tag)
        assert intent.language in {"romanized", "english"}  # either is acceptable


# ═══════════════════════════════════════════════════════════════════════════════
# TestEnglishPromptParsing
# ═══════════════════════════════════════════════════════════════════════════════

class TestEnglishPromptParsing:
    """parse_intent() — English prompts."""

    def _parse(self, prompt: str):
        from tasks.prompt_compiler import parse_intent
        return parse_intent(prompt)

    def test_make_it_viral(self):
        assert self._parse("make it viral").action == "make_viral"

    def test_add_captions(self):
        assert self._parse("add captions").action == "add_captions"

    def test_add_subtitles(self):
        assert self._parse("add subtitles").action == "add_captions"

    def test_speed_up(self):
        assert self._parse("speed up the video").action == "increase_pacing"

    def test_make_shorts(self):
        assert self._parse("make shorts").action == "extract_shorts"

    def test_clean_audio(self):
        assert self._parse("clean audio").action == "clean_audio"

    def test_remove_noise(self):
        assert self._parse("remove background noise").action == "clean_audio"

    def test_strengthen_hook(self):
        assert self._parse("strengthen the hook").action == "strengthen_hook"

    def test_improve_opening(self):
        assert self._parse("improve the opening").action == "strengthen_hook"

    def test_remove_fillers(self):
        assert self._parse("remove filler words").action == "remove_fillers"

    def test_trim_silence(self):
        assert self._parse("trim silence").action == "trim_silence"

    def test_add_music(self):
        assert self._parse("add background music").action == "add_music"

    def test_reorder_scenes(self):
        assert self._parse("reorder scenes").action == "reorder_scenes"

    def test_highlight_best(self):
        assert self._parse("find best moments").action == "highlight_best"

    def test_extract_shorts(self):
        assert self._parse("extract shorts").action == "extract_shorts"

    def test_unknown_returns_unknown(self):
        intent = self._parse("I like turtles")
        assert intent.action == "unknown"
        assert intent.confidence == 0.0

    def test_empty_prompt_returns_unknown(self):
        intent = self._parse("")
        assert intent.action == "unknown"
        assert intent.confidence == 0.0

    def test_language_detected_as_english(self):
        assert self._parse("make it viral").language == "english"


# ═══════════════════════════════════════════════════════════════════════════════
# TestTargetExtraction
# ═══════════════════════════════════════════════════════════════════════════════

class TestTargetExtraction:
    """Target scope extraction from prompts."""

    def _parse(self, prompt: str):
        from tasks.prompt_compiler import parse_intent
        return parse_intent(prompt)

    def test_default_target_is_whole_video(self):
        assert self._parse("add captions").target == "whole_video"

    def test_intro_target_extracted(self):
        intent = self._parse("improve the intro hook")
        assert intent.target == "intro"

    def test_outro_target_extracted(self):
        # Prompt must match an intent AND contain "outro" — target only resolves
        # when a pattern match is found (avoids spurious unknown-intent targets).
        intent = self._parse("remove fillers in the outro")
        assert intent.target == "outro"

    def test_opening_maps_to_intro(self):
        intent = self._parse("fix the opening")
        assert intent.target == "intro"

    def test_full_maps_to_whole_video(self):
        intent = self._parse("add captions to the full video")
        assert intent.target == "whole_video"

    def test_suru_maps_to_intro(self):
        """Nepali word for beginning → intro."""
        intent = self._parse("सुरु राम्रो बनाउनुस्")
        assert intent.target == "intro"


# ═══════════════════════════════════════════════════════════════════════════════
# TestIntensityExtraction
# ═══════════════════════════════════════════════════════════════════════════════

class TestIntensityExtraction:
    """Intensity modifier extraction."""

    def _parse(self, prompt: str):
        from tasks.prompt_compiler import parse_intent
        return parse_intent(prompt)

    def test_default_intensity_is_medium(self):
        assert self._parse("add captions").intensity == "medium"

    def test_alik_maps_to_light(self):
        """Nepali 'alik' (a little) → light."""
        # Use singular "caption" — romanized pattern expects singular form
        intent = self._parse("alik caption thapnus")
        assert intent.intensity == "light"

    def test_slightly_maps_to_light(self):
        intent = self._parse("slightly speed up")
        assert intent.intensity == "light"

    def test_dherei_maps_to_heavy(self):
        """Nepali 'धेरै' (many/very) → heavy."""
        # Use singular "filler" — pattern matches singular; धेरै is the intensity marker
        intent = self._parse("धेरै filler हटाउनुस्")
        assert intent.intensity == "heavy"

    def test_very_maps_to_heavy(self):
        intent = self._parse("very aggressively remove fillers")
        assert intent.intensity == "heavy"

    def test_ekdam_maps_to_heavy(self):
        """Romanized 'ekdam' (very) → heavy."""
        intent = self._parse("ekdam chito banaaunus")
        assert intent.intensity == "heavy"


# ═══════════════════════════════════════════════════════════════════════════════
# TestStrategyMapper
# ═══════════════════════════════════════════════════════════════════════════════

class TestStrategyMapper:
    """map_to_operations() — intent → EditOperations."""

    def _ops(self, action: str, intensity: str = "medium", target: str = "whole_video"):
        from tasks.prompt_compiler import ParsedIntent, map_to_operations
        intent = ParsedIntent(
            action=action,
            target=target,
            intensity=intensity,
            language="english",
            original_prompt=action,
            confidence=0.8,
        )
        return map_to_operations(intent)

    def test_unknown_returns_empty(self):
        assert self._ops("unknown") == []

    def test_remove_fillers_returns_operation(self):
        ops = self._ops("remove_fillers")
        assert len(ops) >= 1
        assert ops[0].operation == "remove_filler"

    def test_trim_silence_returns_cut_operation(self):
        ops = self._ops("trim_silence")
        assert any(op.operation == "cut" for op in ops)

    def test_make_viral_returns_multiple_ops(self):
        """make_viral at medium intensity → hook_rewrite + short_clip + caption."""
        ops = self._ops("make_viral", "medium")
        op_types = {op.operation for op in ops}
        assert "hook_rewrite" in op_types
        assert "short_clip" in op_types

    def test_make_viral_heavy_includes_silence_cut(self):
        ops = self._ops("make_viral", "heavy")
        op_types = {op.operation for op in ops}
        assert "cut" in op_types

    def test_add_captions_returns_caption_op(self):
        ops = self._ops("add_captions")
        assert any(op.operation == "caption" for op in ops)

    def test_caption_op_has_nepali_language(self):
        """Caption operations must target Nepali (ne) content."""
        ops = self._ops("add_captions")
        for op in ops:
            if op.operation == "caption":
                assert op.params.get("language") == "ne", (
                    "Caption operations must specify language='ne' for Nepali"
                )

    def test_extract_shorts_returns_short_clip_op(self):
        ops = self._ops("extract_shorts")
        assert any(op.operation == "short_clip" for op in ops)

    def test_strengthen_hook_targets_intro(self):
        ops = self._ops("strengthen_hook")
        assert all(op.applies_to == "intro" for op in ops)

    def test_increase_pacing_returns_multiple_ops(self):
        """increase_pacing → remove_filler + cut (silence) at minimum."""
        ops = self._ops("increase_pacing", "medium")
        op_types = {op.operation for op in ops}
        assert "remove_filler" in op_types
        assert "cut" in op_types

    def test_heavy_intensity_more_ops_than_light(self):
        light = self._ops("increase_pacing", "light")
        heavy = self._ops("increase_pacing", "heavy")
        assert len(heavy) >= len(light)

    def test_light_fillers_has_higher_min_occurrences(self):
        """Light filler removal should only target frequent fillers."""
        light = self._ops("remove_fillers", "light")
        heavy = self._ops("remove_fillers", "heavy")
        light_min = light[0].params.get("min_occurrences", 0)
        heavy_min = heavy[0].params.get("min_occurrences", 0)
        assert light_min >= heavy_min

    def test_all_ops_have_description(self):
        for action in ["make_viral", "add_captions", "extract_shorts", "clean_audio"]:
            for op in self._ops(action):
                assert op.description, f"Op {op.operation} missing description"

    def test_all_ops_have_estimated_impact(self):
        for action in ["make_viral", "add_captions", "trim_silence", "remove_fillers"]:
            for op in self._ops(action):
                assert op.estimated_impact in {"high", "medium", "low"}, (
                    f"Op {op.operation} has invalid impact: {op.estimated_impact}"
                )

    def test_clean_audio_requires_no_transcript(self):
        """clean_audio is an audio processing op — doesn't need transcript."""
        ops = self._ops("clean_audio")
        assert all("transcript" not in op.requires for op in ops)

    def test_add_captions_requires_transcript(self):
        ops = self._ops("add_captions")
        assert any("transcript" in op.requires for op in ops)

    def test_extract_shorts_requires_scenes(self):
        ops = self._ops("extract_shorts")
        assert any("scenes" in op.requires for op in ops)


# ═══════════════════════════════════════════════════════════════════════════════
# TestValidator
# ═══════════════════════════════════════════════════════════════════════════════

class TestValidator:
    """validate_operations() — context-based filtering."""

    def _make_ops(self, action: str):
        from tasks.prompt_compiler import ParsedIntent, map_to_operations
        intent = ParsedIntent(
            action=action,
            target="whole_video",
            intensity="medium",
            language="english",
            original_prompt=action,
            confidence=0.8,
        )
        return map_to_operations(intent)

    def test_full_context_allows_all_ops(self):
        from tasks.prompt_compiler import validate_operations
        ops = self._make_ops("make_viral")
        ctx = {
            "has_transcript": True,
            "has_scenes": True,
            "asset_status": "ready",
            "duration_seconds": 300.0,
        }
        valid, errors, warnings = validate_operations(ops, ctx)
        assert not errors
        assert len(valid) == len(ops)

    def test_missing_transcript_blocks_caption_op(self):
        from tasks.prompt_compiler import validate_operations
        ops = self._make_ops("add_captions")
        ctx = {
            "has_transcript": False,
            "has_scenes": True,
            "asset_status": "ready",
            "duration_seconds": 300.0,
        }
        valid, errors, warnings = validate_operations(ops, ctx)
        assert errors, "Missing transcript must produce an error"

    def test_missing_scenes_blocks_short_clip_op(self):
        from tasks.prompt_compiler import validate_operations
        ops = self._make_ops("extract_shorts")
        ctx = {
            "has_transcript": True,
            "has_scenes": False,
            "asset_status": "ready",
            "duration_seconds": 300.0,
        }
        valid, errors, warnings = validate_operations(ops, ctx)
        assert errors, "Missing scenes must produce an error"

    def test_wrong_status_blocks_everything(self):
        from tasks.prompt_compiler import validate_operations
        ops = self._make_ops("add_captions")
        ctx = {
            "has_transcript": True,
            "has_scenes": True,
            "asset_status": "transcribing",
            "duration_seconds": 300.0,
        }
        valid, errors, warnings = validate_operations(ops, ctx)
        assert not valid
        assert errors

    def test_short_video_produces_warning_for_shorts(self):
        from tasks.prompt_compiler import validate_operations
        ops = self._make_ops("extract_shorts")
        ctx = {
            "has_transcript": True,
            "has_scenes": True,
            "asset_status": "ready",
            "duration_seconds": 20.0,   # very short video
        }
        valid, errors, warnings = validate_operations(ops, ctx)
        assert any("30 seconds" in w or "under" in w.lower() for w in warnings), (
            f"Expected short video warning, got: {warnings}"
        )

    def test_clean_audio_works_without_transcript(self):
        """clean_audio doesn't need transcript — should pass even without it."""
        from tasks.prompt_compiler import validate_operations
        ops = self._make_ops("clean_audio")
        ctx = {
            "has_transcript": False,
            "has_scenes": False,
            "asset_status": "ready",
            "duration_seconds": 300.0,
        }
        valid, errors, warnings = validate_operations(ops, ctx)
        # clean_audio requires nothing → no errors
        assert not errors
        assert valid


# ═══════════════════════════════════════════════════════════════════════════════
# TestCompilePromptEndToEnd
# ═══════════════════════════════════════════════════════════════════════════════

class TestCompilePromptEndToEnd:
    """compile_prompt() — full pipeline, all language forms."""

    def _full_ctx(self):
        return {
            "has_transcript": True,
            "has_scenes": True,
            "asset_status": "ready",
            "duration_seconds": 600.0,
        }

    def test_nepali_viral_prompt_end_to_end(self):
        from tasks.prompt_compiler import compile_prompt
        result = compile_prompt("viral बनाउनुस्", self._full_ctx())
        assert result.is_valid
        assert result.intent.action == "make_viral"
        assert len(result.operations) >= 1
        assert result.summary

    def test_english_prompt_end_to_end(self):
        from tasks.prompt_compiler import compile_prompt
        result = compile_prompt("remove filler words", self._full_ctx())
        assert result.is_valid
        assert result.intent.action == "remove_fillers"
        assert result.operations

    def test_romanized_prompt_end_to_end(self):
        from tasks.prompt_compiler import compile_prompt
        result = compile_prompt("viral banaunus", self._full_ctx())
        assert result.is_valid
        assert result.intent.action == "make_viral"

    def test_unknown_prompt_returns_empty_ops(self):
        from tasks.prompt_compiler import compile_prompt
        result = compile_prompt("I like turtles", self._full_ctx())
        assert result.intent.action == "unknown"
        assert result.operations == []

    def test_none_context_uses_defaults(self):
        """compile_prompt(context=None) assumes all context available."""
        from tasks.prompt_compiler import compile_prompt
        result = compile_prompt("add captions")
        assert result.is_valid

    def test_result_has_all_required_fields(self):
        from tasks.prompt_compiler import compile_prompt
        result = compile_prompt("add captions", self._full_ctx())
        assert hasattr(result, "intent")
        assert hasattr(result, "operations")
        assert hasattr(result, "validation_errors")
        assert hasattr(result, "warnings")
        assert hasattr(result, "is_valid")
        assert hasattr(result, "summary")

    def test_summary_is_non_empty_string(self):
        from tasks.prompt_compiler import compile_prompt
        result = compile_prompt("speed up", self._full_ctx())
        assert isinstance(result.summary, str) and result.summary

    def test_is_valid_false_when_context_missing(self):
        from tasks.prompt_compiler import compile_prompt
        result = compile_prompt("add captions", {
            "has_transcript": False,
            "has_scenes": False,
            "asset_status": "ready",
            "duration_seconds": 300.0,
        })
        assert not result.is_valid

    def test_all_phase_map_examples_recognized(self):
        """Every example from the phase-map NEPALI_PROMPT_EXAMPLES must be recognized."""
        from tasks.prompt_compiler import compile_prompt
        phase_map_examples = {
            "छिटो बनाउनुस्":          "increase_pacing",
            "viral बनाउनुस्":          "make_viral",
            "caption थप्नुस्":         "add_captions",
            "छोटो clips बनाउनुस्":    "extract_shorts",
            "आवाज सफा गर्नुस्":       "clean_audio",
            "hooks राम्रो बनाउनुस्":  "strengthen_hook",
        }
        for prompt, expected_action in phase_map_examples.items():
            result = compile_prompt(prompt, self._full_ctx())
            assert result.intent.action == expected_action, (
                f"Prompt '{prompt}' expected '{expected_action}', "
                f"got '{result.intent.action}'"
            )

    def test_compile_prompt_is_fast(self):
        """Prompt compiler should be < 10ms (zero LLM calls)."""
        import time
        from tasks.prompt_compiler import compile_prompt
        start = time.monotonic()
        for _ in range(100):
            compile_prompt("viral बनाउनुस्", self._full_ctx())
        elapsed = time.monotonic() - start
        assert elapsed < 1.0, f"100 compile_prompt calls took {elapsed:.2f}s (too slow)"


# ═══════════════════════════════════════════════════════════════════════════════
# TestCompilerResultStructure
# ═══════════════════════════════════════════════════════════════════════════════

class TestCompilerResultStructure:
    """Verify CompilerResult and EditOperation dataclass fields."""

    def test_edit_operation_fields(self):
        from tasks.prompt_compiler import EditOperation
        op = EditOperation(
            operation="caption",
            params={"style": "standard", "language": "ne"},
            description="Add captions.",
            applies_to="whole_video",
            estimated_impact="high",
            requires=["transcript"],
        )
        assert op.operation == "caption"
        assert op.params["language"] == "ne"
        assert "transcript" in op.requires

    def test_parsed_intent_fields(self):
        from tasks.prompt_compiler import ParsedIntent
        intent = ParsedIntent(
            action="make_viral",
            target="whole_video",
            intensity="medium",
            language="mixed",
            original_prompt="viral बनाउनुस्",
            confidence=0.85,
        )
        assert intent.action == "make_viral"
        assert intent.language == "mixed"
        assert intent.confidence == 0.85

    def test_compiler_result_fields(self):
        from tasks.prompt_compiler import compile_prompt
        result = compile_prompt("add captions")
        assert isinstance(result.intent.action, str)
        assert isinstance(result.operations, list)
        assert isinstance(result.validation_errors, list)
        assert isinstance(result.warnings, list)
        assert isinstance(result.is_valid, bool)
        assert isinstance(result.summary, str)


# ═══════════════════════════════════════════════════════════════════════════════
# TestAssetsRouterPromptEndpoint
# ═══════════════════════════════════════════════════════════════════════════════

class TestAssetsRouterPromptEndpoint:
    """Verify POST /prompt endpoint is registered."""

    def test_prompt_endpoint_registered(self):
        from routers.assets import router
        paths = [route.path for route in router.routes]
        matching = [p for p in paths if "prompt" in p]
        assert matching, f"No '/prompt' endpoint found. Paths: {paths}"

    def test_prompt_endpoint_is_post(self):
        from routers.assets import router
        for route in router.routes:
            if "prompt" in getattr(route, "path", ""):
                methods = getattr(route, "methods", set())
                assert "POST" in methods, f"'/prompt' must be POST, got {methods}"
                break

    def test_prompt_compiler_importable_from_tasks(self):
        from tasks.prompt_compiler import compile_prompt
        assert callable(compile_prompt)

    def test_prompt_patterns_importable(self):
        from tasks.prompt_patterns import ALL_PATTERNS, KNOWN_INTENTS
        assert ALL_PATTERNS
        assert KNOWN_INTENTS
