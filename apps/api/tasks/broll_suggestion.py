"""
ViraEdit — AI B-Roll Suggestion Engine.

Uses GPT-4o-mini to scan the transcript and identify moments where
B-roll footage would enhance viewer comprehension or engagement.

Each suggestion includes:
  - start_time / end_time (aligned to Whisper timestamps)
  - broll_prompt: description for image generation or stock search
  - broll_reason: why this moment needs B-roll (e.g. "abstract concept",
    "technical term", "dead air", "topic transition", "emotional beat")
  - confidence: how strongly the AI recommends B-roll here

Design rules:
  - LLM cost ~$0.001–$0.002 per video (GPT-4o-mini)
  - Non-fatal: failure should not block asset delivery
  - Results stored as VISUAL_OPPORTUNITY suggestions with
    suggested_visual="ai_broll" in the action JSONB
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any

log = logging.getLogger("viraedit.tasks.broll_suggestion")

# ── Prompt template ──────────────────────────────────────────────────────────

_BROLL_SYSTEM_PROMPT = """You are a professional video editor analyzing a Nepali-language video transcript. Your task is to identify moments where inserting B-roll footage would significantly improve the video.

For each B-roll opportunity, return:
- start_time: float (seconds)
- end_time: float (seconds) 
- broll_prompt: a vivid, specific description of what the B-roll should show (this will be used for AI image generation or stock footage search — be creative and concrete)
- broll_reason: why B-roll is needed here (one of: "abstract_concept", "technical_term", "dead_air", "topic_transition", "emotional_beat", "story_narrative", "explanation")
- confidence: float 0.0-1.0

Rules:
1. Focus on moments that would benefit from illustration — abstract ideas, technical explanations, topic changes, emotional moments, comparisons
2. Skip very short segments (<2s)  
3. Skip segments already dense with visual language (the speaker is describing something visual)
4. Maximum 8 suggestions per video
5. Prefer spacing suggestions out — don't cluster them
6. Return ONLY valid JSON array — no markdown, no explanation
7. Output format: [{"start_time": ..., "end_time": ..., "broll_prompt": "...", "broll_reason": "...", "confidence": ...}]"""


# ── Dataclass ────────────────────────────────────────────────────────────────

@dataclass
class BRollSuggestion:
    """A detected opportunity to insert AI-generated B-roll footage."""
    start_time: float
    end_time: float
    broll_prompt: str
    broll_reason: str
    confidence: float
    text_excerpt: str = ""
    duration_seconds: float = 4.0

    def to_action_dict(self) -> dict[str, Any]:
        """Serialise for storage in suggestions.action JSONB."""
        return {
            "visual_type": "broll",
            "start_time": self.start_time,
            "end_time": self.end_time,
            "text_excerpt": self.text_excerpt,
            "display_value": self.broll_prompt[:60],
            "suggested_visual": "ai_broll",
            "nepali_label": "",
            "duration_seconds": self.duration_seconds,
            "confidence": self.confidence,
            "broll_prompt": self.broll_prompt,
            "broll_reason": self.broll_reason,
            "generation_status": "pending",
        }


# ── Helpers ──────────────────────────────────────────────────────────────────

def _extract_word_timestamps(words: list[dict]) -> dict[str, Any]:
    """Extract text between timestamps for building the LLM prompt."""
    if not words:
        return {"segments": [], "full_text": ""}

    segments = []
    for w in words:
        segments.append({
            "word": w.get("word", ""),
            "start": w.get("start", 0.0),
            "end": w.get("end", 0.0),
        })

    full_text = " ".join(s["word"] for s in segments)
    return {"segments": segments, "full_text": full_text}


def _find_text_excerpt(
    start_time: float,
    end_time: float,
    words: list[dict],
    context_chars: int = 80,
) -> str:
    """Extract surrounding transcript text for a time range."""
    if not words:
        return ""

    # Collect words within the time range
    excerpt_words = []
    for w in words:
        w_start = float(w.get("start", 0.0))
        w_end = float(w.get("end", 0.0))
        if w_start >= start_time - 1.0 and w_end <= end_time + 1.0:
            excerpt_words.append(w.get("word", ""))

    return " ".join(excerpt_words) if excerpt_words else ""


# ── LLM suggestion ──────────────────────────────────────────────────────────

def suggest_broll_from_transcript(
    full_text: str,
    words: list[dict],
    duration: float,
) -> list[BRollSuggestion]:
    """
    Use GPT-4o-mini to suggest B-roll opportunities from the transcript.

    Args:
        full_text: Complete transcript text.
        words: Whisper word-level timestamps list.
        duration: Total video duration in seconds.

    Returns:
        List of BRollSuggestion objects, sorted by start_time.
    """
    if not full_text.strip():
        return []

    from tasks.ai_client import call_ai
    from tasks.model_router import BudgetState

    budget = BudgetState()

    # Build a compact transcript with timestamps for the LLM
    word_data = _extract_word_timestamps(words)
    # Send the full text with timestamps in a condensed format
    transcript_preview = word_data["full_text"]
    if len(transcript_preview) > 8000:
        transcript_preview = transcript_preview[:8000] + "..."

    user_prompt = (
        f"Video duration: {duration:.1f}s\n\n"
        f"Transcript:\n{transcript_preview}\n\n"
        f"Find the best moments to insert B-roll footage. "
        f"Return a JSON array of objects with start_time, end_time, "
        f"broll_prompt, broll_reason, and confidence."
    )

    try:
        result = call_ai(
            system=_BROLL_SYSTEM_PROMPT,
            user=user_prompt,
            task_type="broll_suggestion",
            budget=budget,
            max_tokens=2048,
            temperature=0.3,
        )

        suggestions_data = result.content
        if isinstance(suggestions_data, str):
            suggestions_data = json.loads(suggestions_data)
        if isinstance(suggestions_data, dict) and "suggestions" in suggestions_data:
            suggestions_data = suggestions_data["suggestions"]

    except Exception as exc:
        log.warning("broll_llm_failed: %s", exc)
        return []

    if not isinstance(suggestions_data, list):
        log.warning("broll_llm_unexpected_format: type=%s", type(suggestions_data).__name__)
        return []

    suggestions: list[BRollSuggestion] = []
    for item in suggestions_data:
        try:
            ss = float(item.get("start_time", 0.0))
            et = float(item.get("end_time", ss + 3.0))
            if et - ss < 1.5:
                continue
            if ss < 0 or et > duration:
                continue

            excerpt = _find_text_excerpt(ss, et, words)
            d = max(3.0, min(8.0, et - ss))

            suggestions.append(BRollSuggestion(
                start_time=ss,
                end_time=et,
                broll_prompt=str(item.get("broll_prompt", "")),
                broll_reason=str(item.get("broll_reason", "explanation")),
                confidence=float(item.get("confidence", 0.7)),
                text_excerpt=excerpt,
                duration_seconds=d,
            ))
        except (ValueError, KeyError, TypeError) as parse_err:
            log.debug("broll_parse_skipped: %s", parse_err)
            continue

    suggestions.sort(key=lambda s: s.start_time)
    log.info(
        "broll_suggestions_generated: count=%d duration=%.1f",
        len(suggestions), duration,
    )
    return suggestions


def run_broll_suggestion_engine(
    full_text: str,
    words: list[dict],
    duration: float,
) -> list[dict[str, Any]]:
    """
    Entry point called from analyze.py or on-demand API.

    Returns:
        List of suggestion-action dicts ready for DB storage as
        VISUAL_OPPORTUNITY suggestions (with suggested_visual="ai_broll").
    """
    suggestions = suggest_broll_from_transcript(full_text, words, duration)
    return [s.to_action_dict() for s in suggestions]
