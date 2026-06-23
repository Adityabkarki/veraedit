"""
ViraEdit — Prompt Compiler.

Translates natural-language user prompts into concrete editing operations.
Supports Nepali (Devanagari), English, and Romanized Nepali.

Flow:
  User types:  "viral बनाउनुस्"   or   "make it viral"   or   "viral banaunus"
       ↓
  parse_intent()   → ParsedIntent (action, target, intensity, confidence)
       ↓
  map_to_operations()  → list[EditOperation] (what to do on the timeline)
       ↓
  validate_operations()  → filtered + annotated list (checks context)
       ↓
  CompilerResult (operations + summary + warnings)

Design:
  - Zero LLM cost — purely rule-based pattern matching
  - Full Nepali support (Devanagari + Romanized + English)
  - Operations are timeline-engine-ready (same format as AI suggestions)
  - Validator checks asset context (no captions without transcript, etc.)
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from tasks.prompt_patterns import (
    ALL_PATTERNS,
    INTENSITY_PATTERNS,
    KNOWN_INTENTS,
    TARGET_PATTERNS,
    Pattern,
)

# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class ParsedIntent:
    """Result of parsing a natural-language prompt."""
    action: str                  # one of KNOWN_INTENTS
    target: str                  # "whole_video", "intro", "outro", "middle", "scene:N"
    intensity: str               # "light", "medium", "heavy"
    language: str                # "nepali", "english", "romanized", "mixed"
    original_prompt: str
    confidence: float            # 0.0–1.0
    matched_pattern: str = ""    # for debugging


@dataclass
class EditOperation:
    """A single editing operation derived from a user intent."""
    operation: str           # e.g. "remove_silences", "generate_captions"
    params: dict             # parameters for the timeline engine
    description: str         # human-readable English description (shown in UI)
    applies_to: str          # "whole_video", "intro", "outro", etc.
    estimated_impact: str    # "high", "medium", "low"
    requires: list[str] = field(default_factory=list)  # e.g. ["transcript", "scenes"]


@dataclass
class CompilerResult:
    """Output of the full prompt compilation pipeline."""
    intent: ParsedIntent
    operations: list[EditOperation]
    validation_errors: list[str]     # hard blockers (missing context)
    warnings: list[str]              # soft issues
    is_valid: bool                   # False if any validation errors
    summary: str                     # "Will remove fillers and tighten pacing"


# ── Strategy map: intent → list of operations ─────────────────────────────────
#
# Each value is a list of (operation, params, description, impact, requires) tuples.
# Parameterised by intensity: "light" | "medium" | "heavy"
#
# These mirror the suggestion types understood by the timeline engine
# (same types as in _VALID_SUGGESTION_TYPES in analyze.py).

def _operations_for(action: str, intensity: str, target: str) -> list[EditOperation]:
    """
    Return the list of EditOperations for a given intent action + intensity.

    Intensity adjusts parameters:
      light  → conservative (only obvious cases)
      medium → balanced (default)
      heavy  → aggressive (all possible improvements)
    """
    t = target

    # ── remove_fillers ────────────────────────────────────────────────────────
    if action == "remove_fillers":
        min_occurrences = {"light": 3, "medium": 1, "heavy": 1}[intensity]
        return [EditOperation(
            operation="remove_filler",
            params={
                "min_occurrences": min_occurrences,
                "include_breaths": intensity == "heavy",
                "target": t,
            },
            description=(
                f"Remove filler words (um, uh, हैन, उम, आ) "
                f"{'and breath sounds ' if intensity == 'heavy' else ''}"
                f"from {t.replace('_', ' ')}."
            ),
            applies_to=t,
            estimated_impact="high" if intensity == "heavy" else "medium",
            requires=["transcript"],
        )]

    # ── trim_silence ──────────────────────────────────────────────────────────
    elif action == "trim_silence":
        min_duration = {"light": 2.5, "medium": 1.5, "heavy": 0.8}[intensity]
        return [EditOperation(
            operation="cut",
            params={
                "type": "silence_cut",
                "min_silence_duration": min_duration,
                "target": t,
            },
            description=(
                f"Remove silences longer than {min_duration:.1f}s "
                f"from {t.replace('_', ' ')}."
            ),
            applies_to=t,
            estimated_impact="medium",
            requires=["transcript"],
        )]

    # ── increase_pacing ───────────────────────────────────────────────────────
    elif action == "increase_pacing":
        ops = [
            EditOperation(
                operation="remove_filler",
                params={"min_occurrences": 1, "include_breaths": False, "target": t},
                description="Remove filler words to tighten pacing.",
                applies_to=t,
                estimated_impact="medium",
                requires=["transcript"],
            ),
            EditOperation(
                operation="cut",
                params={"type": "silence_cut", "min_silence_duration": 1.0, "target": t},
                description="Trim silences over 1 second to increase pace.",
                applies_to=t,
                estimated_impact="medium",
                requires=["transcript"],
            ),
        ]
        if intensity == "heavy":
            ops.append(EditOperation(
                operation="audio_fix",
                params={"type": "speed_ramp", "factor": 1.05, "target": t},
                description="Apply 5% speed ramp to slow sections.",
                applies_to=t,
                estimated_impact="low",
                requires=["scenes"],
            ))
        return ops

    # ── make_viral ────────────────────────────────────────────────────────────
    elif action == "make_viral":
        ops = [
            EditOperation(
                operation="hook_rewrite",
                params={"generate_options": 5, "target": "intro"},
                description="Rewrite the opening hook for higher retention.",
                applies_to="intro",
                estimated_impact="high",
                requires=["transcript", "scenes"],
            ),
            EditOperation(
                operation="short_clip",
                params={"extract_top_n": 5, "min_score": 7.0, "target": t},
                description="Extract top viral short-clip candidates.",
                applies_to=t,
                estimated_impact="high",
                requires=["scenes"],
            ),
        ]
        if intensity in {"medium", "heavy"}:
            ops.append(EditOperation(
                operation="caption",
                params={"style": "viral", "target": t},
                description="Add bold captions (increases watch time for silent viewers).",
                applies_to=t,
                estimated_impact="medium",
                requires=["transcript"],
            ))
        if intensity == "heavy":
            ops.append(EditOperation(
                operation="cut",
                params={"type": "silence_cut", "min_silence_duration": 1.0, "target": t},
                description="Trim dead air to boost pacing.",
                applies_to=t,
                estimated_impact="medium",
                requires=["transcript"],
            ))
        return ops

    # ── add_captions ──────────────────────────────────────────────────────────
    elif action == "add_captions":
        style = {"light": "minimal", "medium": "standard", "heavy": "bold"}[intensity]
        return [EditOperation(
            operation="caption",
            params={"style": style, "target": t, "language": "ne"},
            description=(
                f"Generate {style} Nepali captions (Devanagari) "
                f"for {t.replace('_', ' ')}."
            ),
            applies_to=t,
            estimated_impact="high",
            requires=["transcript"],
        )]

    # ── extract_shorts ────────────────────────────────────────────────────────
    elif action == "extract_shorts":
        min_score = {"light": 8.0, "medium": 7.0, "heavy": 6.0}[intensity]
        return [EditOperation(
            operation="short_clip",
            params={"extract_top_n": 10, "min_score": min_score, "target": t},
            description=(
                f"Extract short-clip candidates (15–60 s) with "
                f"Nepal platform scores (YouTube + Facebook priority). "
                f"Minimum virality score: {min_score:.0f}/10."
            ),
            applies_to=t,
            estimated_impact="high",
            requires=["scenes"],
        )]

    # ── clean_audio ───────────────────────────────────────────────────────────
    elif action == "clean_audio":
        return [EditOperation(
            operation="audio_fix",
            params={
                "type": "noise_reduction",
                "intensity": intensity,
                "target": t,
            },
            description=(
                f"Apply {'aggressive ' if intensity == 'heavy' else ''}"
                f"noise reduction to improve audio clarity."
            ),
            applies_to=t,
            estimated_impact="high" if intensity == "heavy" else "medium",
            requires=[],  # audio processing doesn't need transcript
        )]

    # ── strengthen_hook ───────────────────────────────────────────────────────
    elif action == "strengthen_hook":
        return [EditOperation(
            operation="hook_rewrite",
            params={"generate_options": 5, "target": "intro"},
            description=(
                "Analyse the opening 60 seconds and generate 5 alternative "
                "Nepali hooks with English rationale for each."
            ),
            applies_to="intro",
            estimated_impact="high",
            requires=["transcript", "scenes"],
        )]

    # ── add_music ─────────────────────────────────────────────────────────────
    elif action == "add_music":
        return [EditOperation(
            operation="audio_fix",
            params={
                "type": "add_background_music",
                "volume": {"light": 0.1, "medium": 0.15, "heavy": 0.2}[intensity],
                "target": t,
            },
            description=(
                f"Add background music at "
                f"{int({'light': 10, 'medium': 15, 'heavy': 20}[intensity])}% volume."
            ),
            applies_to=t,
            estimated_impact="medium",
            requires=[],
        )]

    # ── reorder_scenes ────────────────────────────────────────────────────────
    elif action == "reorder_scenes":
        return [EditOperation(
            operation="reorder",
            params={"strategy": "virality_first", "target": t},
            description=(
                "Reorder scenes to put the highest-scoring moment first, "
                "followed by value-dense content."
            ),
            applies_to=t,
            estimated_impact="medium",
            requires=["scenes"],
        )]

    # ── highlight_best ────────────────────────────────────────────────────────
    elif action == "highlight_best":
        return [EditOperation(
            operation="highlight",
            params={"top_n": 3, "target": t},
            description="Mark the top 3 scenes as highlights for quick review.",
            applies_to=t,
            estimated_impact="low",
            requires=["scenes"],
        )]

    # ── adjust_volume ─────────────────────────────────────────────────────────
    elif action == "adjust_volume":
        return [EditOperation(
            operation="audio_fix",
            params={"type": "normalize_volume", "target": t},
            description="Normalize audio volume to consistent levels across the video.",
            applies_to=t,
            estimated_impact="medium",
            requires=[],
        )]

    # ── add_broll ─────────────────────────────────────────────────────────────
    elif action == "add_broll":
        return [EditOperation(
            operation="visual_opportunity",
            params={"target": t},
            description=(
                "Identify visual opportunity points (stats, lists, transitions) "
                "and suggest B-roll placement."
            ),
            applies_to=t,
            estimated_impact="medium",
            requires=["scenes"],
        )]

    # ── unknown ───────────────────────────────────────────────────────────────
    return []


# ── Context requirements map ──────────────────────────────────────────────────

_CONTEXT_REQUIREMENTS: dict[str, str] = {
    "transcript": "Transcript must be available (asset status = 'ready').",
    "scenes":     "Scene analysis must be complete (asset status = 'ready').",
    "shorts":     "Shorts extraction must be complete (asset status = 'ready').",
}


# ── Language detection ────────────────────────────────────────────────────────

_DEVANAGARI_RE = re.compile(r"[ऀ-ॿ]")  # Unicode Devanagari block


def _detect_language(prompt: str, matched_lang: str) -> str:
    """
    Determine the language label for a prompt.
    Returns "nepali", "english", "romanized", or "mixed".
    """
    has_devanagari = bool(_DEVANAGARI_RE.search(prompt))
    # Has Latin chars (ASCII letters)
    has_latin = bool(re.search(r"[a-zA-Z]", prompt))

    if has_devanagari and has_latin:
        return "mixed"
    if has_devanagari:
        return "nepali"
    if matched_lang in {"romanized", "nepali"}:
        return "romanized"
    return "english"


# ── Core functions ────────────────────────────────────────────────────────────

def parse_intent(prompt: str) -> ParsedIntent:
    """
    Parse a user prompt into a structured intent.

    Tries all patterns (Nepali → Romanized → English) and returns the
    highest-confidence match. Defaults to "unknown" if no pattern matches.

    Args:
        prompt: Raw user input (any language / script).

    Returns:
        ParsedIntent with action, target, intensity, confidence.
    """
    if not prompt or not prompt.strip():
        return ParsedIntent(
            action="unknown",
            target="whole_video",
            intensity="medium",
            language="english",
            original_prompt=prompt or "",
            confidence=0.0,
        )

    prompt_stripped = prompt.strip()
    best_match: ParsedIntent | None = None
    best_confidence: float = 0.0

    for pat in ALL_PATTERNS:
        if pat.regex.search(prompt_stripped):
            base_confidence = 0.6 + pat.confidence_boost
            lang = _detect_language(prompt_stripped, pat.language)
            # Boost confidence if pattern language matches detected script
            if (lang == "nepali" and pat.language == "nepali") or \
               (lang == "romanized" and pat.language == "romanized"):
                base_confidence += 0.1

            if base_confidence > best_confidence:
                best_confidence = base_confidence
                best_match = ParsedIntent(
                    action=pat.intent,
                    target=_extract_target(prompt_stripped),
                    intensity=_extract_intensity(prompt_stripped),
                    language=lang,
                    original_prompt=prompt_stripped,
                    confidence=round(min(base_confidence, 1.0), 3),
                    matched_pattern=pat.regex.pattern[:60],
                )

    if best_match is None:
        return ParsedIntent(
            action="unknown",
            target="whole_video",
            intensity="medium",
            language=_detect_language(prompt_stripped, "english"),
            original_prompt=prompt_stripped,
            confidence=0.0,
        )

    return best_match


def _extract_target(prompt: str) -> str:
    """Extract the target scope from the prompt (default: whole_video)."""
    for pattern, target_value in TARGET_PATTERNS:
        m = pattern.search(prompt)
        if m:
            if target_value == "scene" and m.lastindex:
                return f"scene:{m.group(1)}"
            return target_value
    return "whole_video"


def _extract_intensity(prompt: str) -> str:
    """Extract intensity modifier from the prompt (default: medium)."""
    for pattern, intensity_value in INTENSITY_PATTERNS:
        if pattern.search(prompt):
            return intensity_value
    return "medium"


def map_to_operations(intent: ParsedIntent) -> list[EditOperation]:
    """
    Map a parsed intent to a list of concrete editing operations.

    Args:
        intent: Parsed user intent.

    Returns:
        List of EditOperation objects ready for timeline engine or DB storage.
    """
    if intent.action == "unknown":
        return []
    return _operations_for(intent.action, intent.intensity, intent.target)


def validate_operations(
    operations: list[EditOperation],
    context: dict[str, Any],
) -> tuple[list[EditOperation], list[str], list[str]]:
    """
    Validate operations against the asset context.

    Args:
        operations: List of EditOperations from map_to_operations().
        context:    Dict with keys: "has_transcript", "has_scenes",
                    "asset_status", "duration_seconds".

    Returns:
        (valid_ops, errors, warnings)
        - valid_ops: operations that can proceed
        - errors: blocking issues (missing requirements)
        - warnings: soft issues (e.g. context not ideal)
    """
    valid_ops: list[EditOperation] = []
    errors: list[str] = []
    warnings: list[str] = []

    asset_status = context.get("asset_status", "unknown")
    has_transcript = context.get("has_transcript", False)
    has_scenes = context.get("has_scenes", False)
    duration = float(context.get("duration_seconds", 0.0))

    if asset_status not in {"ready", "analyzing"}:
        errors.append(
            f"Asset is not ready for editing (status: {asset_status}). "
            "Wait for transcription and analysis to complete."
        )
        return [], errors, warnings

    for op in operations:
        op_errors = []
        for req in op.requires:
            if req == "transcript" and not has_transcript:
                op_errors.append(
                    f"'{op.operation}' requires a transcript. "
                    "Transcription hasn't completed yet."
                )
            elif req == "scenes" and not has_scenes:
                op_errors.append(
                    f"'{op.operation}' requires scene analysis. "
                    "Analysis hasn't completed yet."
                )

        if op_errors:
            errors.extend(op_errors)
        else:
            valid_ops.append(op)

    # Soft warnings
    if duration < 30.0 and any(op.operation == "short_clip" for op in valid_ops):
        warnings.append(
            "Video is under 30 seconds — short-clip extraction may produce few results."
        )
    if not has_scenes and any(op.operation == "hook_rewrite" for op in valid_ops):
        warnings.append(
            "Hook rewrite works best after scene analysis. "
            "Results will be limited without scene data."
        )

    return valid_ops, errors, warnings


def _build_summary(intent: ParsedIntent, operations: list[EditOperation], errors: list[str]) -> str:
    """Build a human-readable English summary of what will happen."""
    if not operations and errors:
        return f"Cannot apply '{intent.action}': " + "; ".join(errors[:2])

    if not operations:
        return f"No operations found for intent '{intent.action}'. Try a more specific command."

    action_phrases = {
        "remove_filler": "remove filler words",
        "cut": "cut silent/slow sections",
        "caption": "add captions",
        "short_clip": "extract short clips",
        "hook_rewrite": "rewrite the opening hook",
        "audio_fix": "fix audio",
        "reorder": "reorder scenes",
        "highlight": "mark highlights",
        "visual_opportunity": "suggest B-roll",
    }

    descs = []
    seen_ops = set()
    for op in operations:
        phrase = action_phrases.get(op.operation, op.operation)
        if phrase not in seen_ops:
            seen_ops.add(phrase)
            descs.append(phrase)

    op_text = " and ".join(descs[:3])
    if len(descs) > 3:
        op_text += f" (+{len(descs) - 3} more)"

    scope = "" if intent.target == "whole_video" else f" (scope: {intent.target.replace('_', ' ')})"
    intensity_text = f" [{intent.intensity} intensity]" if intent.intensity != "medium" else ""

    return f"Will {op_text}{scope}{intensity_text}."


# ── Main entry point ──────────────────────────────────────────────────────────

def compile_prompt(
    prompt: str,
    context: dict[str, Any] | None = None,
) -> CompilerResult:
    """
    Compile a natural-language prompt into validated editing operations.

    Args:
        prompt:  User's input in Nepali, English, or Romanized Nepali.
        context: Asset context dict. Keys:
                   has_transcript (bool)
                   has_scenes (bool)
                   asset_status (str)
                   duration_seconds (float)
                 If None, assumes all context is available (test mode).

    Returns:
        CompilerResult with operations, summary, errors, warnings.
    """
    if context is None:
        context = {
            "has_transcript": True,
            "has_scenes": True,
            "asset_status": "ready",
            "duration_seconds": 300.0,
        }

    intent = parse_intent(prompt)
    raw_ops = map_to_operations(intent)
    valid_ops, errors, warnings = validate_operations(raw_ops, context)
    summary = _build_summary(intent, valid_ops, errors)

    return CompilerResult(
        intent=intent,
        operations=valid_ops,
        validation_errors=errors,
        warnings=warnings,
        is_valid=len(errors) == 0,
        summary=summary,
    )
