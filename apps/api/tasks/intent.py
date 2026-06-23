"""
ViraEdit — Nepali scene intent detection.

Classifies each scene transcript into one of 7 intents:
  hook     — direct address, bold claim, question, opens with energy
  problem  — pain point, challenge, "why is X hard?"
  story    — personal narrative, anecdote, experience
  value    — tips, tutorial steps, how-to explanation
  cta      — subscribe, like, share, follow
  filler   — heavy filler words, low-energy transition
  other    — none of the above

Intent is detected via regex patterns against the Nepali + English transcript.
No API calls — runs cheaply inside the Celery task.

All pattern lists are in NEPALI (Devanagari) where relevant so they match
the transcript text produced by Whisper.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional


# ── Intent enum ───────────────────────────────────────────────────────────────

class SceneIntent(str, Enum):
    HOOK = "hook"
    PROBLEM = "problem"
    STORY = "story"
    VALUE = "value"
    CTA = "cta"
    FILLER = "filler"
    OTHER = "other"


# ── Pattern lists ─────────────────────────────────────────────────────────────

# Direct address, energy openers, question hooks
_HOOK_PATTERNS: list[re.Pattern] = [
    re.compile(r"साथीहरू", re.IGNORECASE),           # "Friends"
    re.compile(r"दोस्तहरू", re.IGNORECASE),           # "Friends" (alt)
    re.compile(r"नमस्ते", re.IGNORECASE),             # "Hello"
    re.compile(r"के तपाईं", re.IGNORECASE),           # "Do you"
    re.compile(r"के तपाइँ", re.IGNORECASE),           # "Do you" (alt spelling)
    re.compile(r"के हामी", re.IGNORECASE),            # "Do we"
    re.compile(r"आज म", re.IGNORECASE),               # "Today I"
    re.compile(r"आज हामी", re.IGNORECASE),            # "Today we"
    re.compile(r"सबैभन्दा", re.IGNORECASE),           # "Most / Best"
    re.compile(r"सबभन्दा", re.IGNORECASE),            # alt spelling
    re.compile(r"यो video", re.IGNORECASE),           # "This video"
    re.compile(r"यो भिडियो", re.IGNORECASE),          # "This video" (Devanagari)
    re.compile(r"मैले .{1,20}सिके?", re.IGNORECASE), # "I learned..."
    re.compile(r"तपाईंलाई .{1,20}थाहा", re.IGNORECASE),  # "You don't know..."
    # English patterns (code-switching common in Nepali YouTube)
    re.compile(r"\bguys\b", re.IGNORECASE),
    re.compile(r"\bwelcome back\b", re.IGNORECASE),
    re.compile(r"\btoday (i|we|i'm)\b", re.IGNORECASE),
]

# Problem / pain-point scenes
_PROBLEM_PATTERNS: list[re.Pattern] = [
    re.compile(r"समस्या", re.IGNORECASE),    # "Problem"
    re.compile(r"गाह्रो", re.IGNORECASE),    # "Difficult"
    re.compile(r"गह्रो", re.IGNORECASE),     # alt spelling
    re.compile(r"मुस्किल", re.IGNORECASE),   # "Difficult/hard"
    re.compile(r"किन .{1,30}छ\?", re.IGNORECASE),   # "Why is..."
    re.compile(r"कसरी .{1,30}छ\?", re.IGNORECASE),  # "How is..."
    re.compile(r"के गर्ने", re.IGNORECASE),  # "What to do"
    re.compile(r"challenge", re.IGNORECASE),
    re.compile(r"problem", re.IGNORECASE),
    re.compile(r"struggle", re.IGNORECASE),
    re.compile(r"mistake", re.IGNORECASE),
]

# Personal story / narrative
_STORY_PATTERNS: list[re.Pattern] = [
    re.compile(r"मेरो", re.IGNORECASE),      # "My"
    re.compile(r"मैले", re.IGNORECASE),      # "I (did/said)"
    re.compile(r"हाम्रो", re.IGNORECASE),    # "Our"
    re.compile(r"मलाई", re.IGNORECASE),      # "To me / I felt"
    re.compile(r"त्यो बेला", re.IGNORECASE), # "At that time"
    re.compile(r"त्यतिबेला", re.IGNORECASE), # "At that time" (alt)
    re.compile(r"एक दिन", re.IGNORECASE),    # "One day"
    re.compile(r"my story", re.IGNORECASE),
    re.compile(r"i remember", re.IGNORECASE),
    re.compile(r"back then", re.IGNORECASE),
]

# Tutorial / how-to / value delivery
_VALUE_PATTERNS: list[re.Pattern] = [
    re.compile(r"step \d", re.IGNORECASE),
    re.compile(r"पहिलो चरण", re.IGNORECASE),    # "First step"
    re.compile(r"दोस्रो चरण", re.IGNORECASE),   # "Second step"
    re.compile(r"tip \d", re.IGNORECASE),
    re.compile(r"\d+ tips?", re.IGNORECASE),
    re.compile(r"कसरी गर्ने", re.IGNORECASE),   # "How to do"
    re.compile(r"तरिका", re.IGNORECASE),         # "Method / Way"
    re.compile(r"फाइदा", re.IGNORECASE),         # "Benefit"
    re.compile(r"सिक्नुहोस्", re.IGNORECASE),    # "Learn"
    re.compile(r"how to", re.IGNORECASE),
    re.compile(r"tutorial", re.IGNORECASE),
    re.compile(r"for example", re.IGNORECASE),
    re.compile(r"उदाहरण", re.IGNORECASE),        # "Example"
]

# Call to action
_CTA_PATTERNS: list[re.Pattern] = [
    re.compile(r"subscribe", re.IGNORECASE),
    re.compile(r"सदस्यता", re.IGNORECASE),       # "Subscribe"
    re.compile(r"like.*गर्नुहोस्", re.IGNORECASE),
    re.compile(r"bell.*icon", re.IGNORECASE),
    re.compile(r"notification", re.IGNORECASE),
    re.compile(r"comment.*गर्नुहोस्", re.IGNORECASE),
    re.compile(r"share.*गर्नुहोस्", re.IGNORECASE),
    re.compile(r"follow.*गर्नुहोस्", re.IGNORECASE),
    re.compile(r"hit the.*like", re.IGNORECASE),
    re.compile(r"smash.*like", re.IGNORECASE),
    re.compile(r"don.t forget to", re.IGNORECASE),
    re.compile(r"instagram", re.IGNORECASE),
    re.compile(r"facebook", re.IGNORECASE),
]

# Nepali filler words — heavy occurrence → filler scene
_FILLER_WORDS = [
    "उम", "आ", "हैन र", "भनेको", "के हो", "त्यो", "अनि", "ठिकै",
    "um", "uh", "like", "you know", "basically", "actually",
]


# ── Filler density check ──────────────────────────────────────────────────────

def _filler_density(text: str) -> float:
    """Return fraction of text tokens that are filler words (0.0–1.0)."""
    if not text.strip():
        return 0.0
    tokens = text.split()
    if not tokens:
        return 0.0
    filler_count = sum(
        1 for tok in tokens
        if any(f.lower() in tok.lower() for f in _FILLER_WORDS)
    )
    return filler_count / len(tokens)


# ── Public API ────────────────────────────────────────────────────────────────

def detect_scene_intent(transcript_text: str) -> SceneIntent:
    """
    Classify a scene's transcript text into a SceneIntent.

    Priority order (checked in order, first match wins):
        CTA → HOOK → PROBLEM → VALUE → STORY → FILLER → OTHER
    """
    if not transcript_text or not transcript_text.strip():
        return SceneIntent.OTHER

    # CTA first — even if there's hook language, if they're asking to subscribe it's CTA
    for pattern in _CTA_PATTERNS:
        if pattern.search(transcript_text):
            return SceneIntent.CTA

    # Filler density check (before other patterns — a filler-heavy scene is filler)
    if _filler_density(transcript_text) > 0.25:
        return SceneIntent.FILLER

    for pattern in _HOOK_PATTERNS:
        if pattern.search(transcript_text):
            return SceneIntent.HOOK

    for pattern in _PROBLEM_PATTERNS:
        if pattern.search(transcript_text):
            return SceneIntent.PROBLEM

    for pattern in _VALUE_PATTERNS:
        if pattern.search(transcript_text):
            return SceneIntent.VALUE

    for pattern in _STORY_PATTERNS:
        if pattern.search(transcript_text):
            return SceneIntent.STORY

    return SceneIntent.OTHER


def classify_scenes(scenes: list[dict]) -> list[dict]:
    """
    Add an `intent` field to each scene dict in place.

    Args:
        scenes: List of scene dicts (from Claude scene analysis).
                Each must have a `summary` or `transcript_excerpt` key.

    Returns:
        Same list with `intent` key added to each scene.
    """
    for scene in scenes:
        text = scene.get("transcript_excerpt") or scene.get("summary") or ""
        scene["intent"] = detect_scene_intent(text).value
    return scenes
