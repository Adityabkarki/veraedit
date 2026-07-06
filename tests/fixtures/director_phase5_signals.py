"""Phase 5 synthetic signal fixtures — messy but realistic per content pillar."""
from __future__ import annotations

from typing import Any

# Cross-talk podcast: overlapping speakers, topic shifts, emphasis
PODCAST_SIGNALS: dict[str, Any] = {
    "durationSeconds": 180,
    "speakerChanges": [
        {"start": 0, "end": 12, "confidence": 0.91, "speakerId": "A", "confidenceSource": "ml"},
        {"start": 12.5, "end": 28, "confidence": 0.89, "speakerId": "B", "confidenceSource": "ml"},
        {"start": 28.2, "end": 45, "confidence": 0.87, "speakerId": "A", "confidenceSource": "ml"},
    ],
    "topicShifts": [
        {"start": 0, "end": 30, "confidence": 0.8, "topicLabel": "Intro"},
        {"start": 45, "end": 90, "confidence": 0.75, "topicLabel": "Main topic"},
    ],
    "stats": [],
    "comparisons": [],
    "emphasisMoments": [{"start": 15, "end": 18, "confidence": 0.85, "text": "Big moment"}],
    "silences": [{"start": 44, "end": 45.5, "confidence": 0.9}],
    "sustainedSpeech": [{"start": 0, "end": 12, "confidence": 0.8}],
    "words": [],
    "ctaPhrases": [],
    "featureMentions": [],
    "sceneSegments": [{"start": 0, "end": 180, "confidence": 0.9, "sceneType": "talking_head"}],
}

# Stat-heavy consultancy with filler gaps
CONSULTANCY_SIGNALS: dict[str, Any] = {
    "durationSeconds": 240,
    "speakerChanges": [],
    "topicShifts": [
        {"start": 0, "end": 60, "confidence": 0.8, "topicLabel": "Overview"},
        {"start": 90, "end": 180, "confidence": 0.78, "topicLabel": "Metrics"},
    ],
    "stats": [
        {"start": 30, "end": 35, "confidence": 0.92, "rawText": "40% growth", "value": "40%", "label": "Growth"},
        {"start": 95, "end": 100, "confidence": 0.9, "rawText": "2.5M users", "value": "2.5M", "label": "Users"},
        {"start": 150, "end": 155, "confidence": 0.88, "rawText": "15% churn", "value": "15%", "label": "Churn"},
    ],
    "comparisons": [
        {"start": 120, "end": 125, "confidence": 0.85, "text": "compared to last year"},
    ],
    "emphasisMoments": [],
    "silences": [{"start": 58, "end": 61, "confidence": 0.85}],
    "sustainedSpeech": [],
    "words": [],
    "ctaPhrases": [],
    "featureMentions": [],
    "sceneSegments": [{"start": 0, "end": 240, "confidence": 0.9, "sceneType": "talking_head"}],
}

# Fast-cut social with hooks and CTAs
SOCIAL_SIGNALS: dict[str, Any] = {
    "durationSeconds": 45,
    "speakerChanges": [],
    "topicShifts": [
        {"start": 0, "end": 8, "confidence": 0.9, "topicLabel": "Hook"},
        {"start": 8, "end": 35, "confidence": 0.85, "topicLabel": "Body"},
    ],
    "stats": [],
    "comparisons": [],
    "emphasisMoments": [
        {"start": 2, "end": 5, "confidence": 0.95, "text": "Wait for this"},
        {"start": 20, "end": 23, "confidence": 0.9, "text": "Key point"},
    ],
    "silences": [],
    "sustainedSpeech": [],
    "words": [
        {"index": 0, "text": "subscribe", "start": 40, "end": 41},
    ],
    "ctaPhrases": [{"start": 40, "end": 43, "confidence": 0.9, "text": "subscribe"}],
    "featureMentions": [],
    "sceneSegments": [{"start": 0, "end": 45, "confidence": 0.9, "sceneType": "talking_head"}],
}

# Screen-recorded product demo
SHOWCASE_SIGNALS: dict[str, Any] = {
    "durationSeconds": 120,
    "speakerChanges": [],
    "topicShifts": [],
    "stats": [],
    "comparisons": [],
    "emphasisMoments": [],
    "silences": [],
    "sustainedSpeech": [],
    "words": [],
    "ctaPhrases": [],
    "featureMentions": [
        {"start": 25, "end": 30, "confidence": 0.9, "text": "click this button"},
        {"start": 70, "end": 75, "confidence": 0.88, "text": "on the screen"},
    ],
    "sceneSegments": [
        {"start": 0, "end": 50, "confidence": 0.9, "sceneType": "talking_head"},
        {"start": 50, "end": 120, "confidence": 0.92, "sceneType": "screen_recording"},
    ],
}

PHASE5_FIXTURES: dict[str, dict[str, Any]] = {
    "podcast": PODCAST_SIGNALS,
    "consultancy": CONSULTANCY_SIGNALS,
    "social": SOCIAL_SIGNALS,
    "showcase": SHOWCASE_SIGNALS,
}
