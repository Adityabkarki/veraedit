"""
ViraEdit — Platform Scoring for Short Clips.

Scores a short-clip candidate (0–10) for each platform using Nepal-specific rules.
Nepal platform priority: YouTube > Facebook > TikTok > Instagram > LinkedIn.

Facebook ranks #2 in Nepal (unlike Western markets where it ranks #4),
because Nepali Tier-2/3 city audiences primarily consume video on Facebook.

Platform sweet spots (duration, energy, format):
  YouTube Shorts : 30–60 s, strong hook in first 3 s, 9:16 or 16:9
  Facebook Reels  : 30–60 s, subtitles critical (many watch muted), high energy
  TikTok          : 15–45 s, hook in first 2 s, fast pacing, trending audio
  Instagram Reels : 15–30 s, visually compelling, aesthetic value
  LinkedIn        : 30–60 s, educational/professional tone, calm pacing

All scores are returned as floats in [0.0, 10.0].
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# ── Nepal platform priority ────────────────────────────────────────────────────

NEPAL_PLATFORM_PRIORITY: list[str] = [
    "youtube",
    "facebook",   # unusually high for Nepal
    "tiktok",
    "instagram",
    "linkedin",
]


# ── Duration sweet spots per platform (seconds) ───────────────────────────────

PLATFORM_DURATION = {
    "youtube":   {"min": 20, "sweet_min": 30, "sweet_max": 60, "max": 60},
    "facebook":  {"min": 20, "sweet_min": 30, "sweet_max": 60, "max": 60},
    "tiktok":    {"min": 15, "sweet_min": 15, "sweet_max": 45, "max": 60},
    "instagram": {"min": 15, "sweet_min": 15, "sweet_max": 30, "max": 60},
    "linkedin":  {"min": 30, "sweet_min": 30, "sweet_max": 60, "max": 60},
}


# ── Dataclass ─────────────────────────────────────────────────────────────────

@dataclass
class PlatformScores:
    """Scores for a short clip across all supported platforms."""
    youtube: float = 0.0
    facebook: float = 0.0
    tiktok: float = 0.0
    instagram: float = 0.0
    linkedin: float = 0.0

    def as_dict(self) -> dict[str, float]:
        return {
            "youtube": round(self.youtube, 2),
            "facebook": round(self.facebook, 2),
            "tiktok": round(self.tiktok, 2),
            "instagram": round(self.instagram, 2),
            "linkedin": round(self.linkedin, 2),
        }

    def platform_ranking(self) -> list[str]:
        """Return platforms sorted by score descending (Nepal priority as tiebreaker)."""
        scores = self.as_dict()
        return sorted(
            scores.keys(),
            key=lambda p: (round(scores[p], 1), -NEPAL_PLATFORM_PRIORITY.index(p)),
            reverse=True,
        )

    def best_platform(self) -> str:
        """The highest-scoring platform for this short."""
        return self.platform_ranking()[0]

    def nepal_weighted_score(self) -> float:
        """
        Weighted average using Nepal audience distribution.
        YouTube 35%, Facebook 30%, TikTok 20%, Instagram 10%, LinkedIn 5%.
        """
        return round(
            self.youtube   * 0.35
            + self.facebook  * 0.30
            + self.tiktok    * 0.20
            + self.instagram * 0.10
            + self.linkedin  * 0.05,
            2,
        )


# ── Scoring functions ─────────────────────────────────────────────────────────

def _duration_score(duration: float, platform: str) -> float:
    """
    Score duration fit for the platform (0–2.5 pts).
    Sweet-spot = 2.5, outside sweet-spot = 1.0–2.0, outside range = 0.
    """
    spec = PLATFORM_DURATION.get(platform, PLATFORM_DURATION["youtube"])
    if duration < spec["min"] or duration > spec["max"]:
        return 0.0
    if spec["sweet_min"] <= duration <= spec["sweet_max"]:
        return 2.5
    # Linear decay outside sweet spot
    if duration < spec["sweet_min"]:
        ratio = (duration - spec["min"]) / max(spec["sweet_min"] - spec["min"], 1)
        return 1.0 + ratio * 1.5
    else:
        ratio = (spec["max"] - duration) / max(spec["max"] - spec["sweet_max"], 1)
        return 1.0 + ratio * 1.5


def _hook_score(hook_strength: float) -> float:
    """Score the strength of the opening hook (0–2.5 pts)."""
    return round(hook_strength * 2.5, 2)


def _energy_score(energy_level: float, target_energy: str) -> float:
    """
    Score energy fit (0–2.0 pts).
    target_energy: "high" (TikTok/Facebook) | "medium" (YouTube) | "low" (LinkedIn)
    """
    if target_energy == "high":
        return round(energy_level * 2.0, 2)
    elif target_energy == "medium":
        # penalise both extremes
        return round((1.0 - abs(energy_level - 0.6)) * 2.0, 2)
    else:  # low / calm
        return round((1.0 - energy_level) * 2.0, 2)


def _starts_with_hook(intent_of_first_scene: str) -> float:
    """Bonus for starting with a HOOK-intent scene (0–1.5 pts)."""
    if intent_of_first_scene == "hook":
        return 1.5
    elif intent_of_first_scene in {"value", "story"}:
        return 0.75
    elif intent_of_first_scene == "filler":
        return -0.5  # penalty
    return 0.0


def _viral_base(viral_score: float) -> float:
    """Convert scene viral score (0–10) → 0–1.5 pts."""
    return round(min(viral_score / 10.0 * 1.5, 1.5), 2)


# ── Per-platform scoring ──────────────────────────────────────────────────────

def score_for_youtube(
    duration: float,
    hook_strength: float,
    energy_level: float,
    viral_score: float,
    first_scene_intent: str,
) -> float:
    """YouTube Shorts: medium energy, strong hook, 30–60s sweet spot."""
    score = (
        _duration_score(duration, "youtube")
        + _hook_score(hook_strength)
        + _energy_score(energy_level, "medium")
        + _starts_with_hook(first_scene_intent)
        + _viral_base(viral_score)
    )
    return round(min(max(score, 0.0), 10.0), 2)


def score_for_facebook(
    duration: float,
    hook_strength: float,
    energy_level: float,
    viral_score: float,
    first_scene_intent: str,
    has_speech: bool = True,
) -> float:
    """
    Facebook Reels (Nepal-specific rules):
    - 30–60s sweet spot
    - High energy performs best (mobile-first viewers)
    - Caption/subtitle bonus (many watch on mute in public)
    - Nepali-language content gets native audience reach bonus
    """
    score = (
        _duration_score(duration, "facebook")
        + _hook_score(hook_strength)
        + _energy_score(energy_level, "high")
        + _starts_with_hook(first_scene_intent)
        + _viral_base(viral_score)
    )
    # Nepal-specific: speech content gets Nepali audience reach bonus
    if has_speech:
        score += 0.5
    return round(min(max(score, 0.0), 10.0), 2)


def score_for_tiktok(
    duration: float,
    hook_strength: float,
    energy_level: float,
    viral_score: float,
    first_scene_intent: str,
) -> float:
    """TikTok: fast pacing, 15–45s sweet spot, hook in first 2s."""
    score = (
        _duration_score(duration, "tiktok")
        + _hook_score(hook_strength) * 1.2   # hook matters more on TikTok
        + _energy_score(energy_level, "high")
        + _starts_with_hook(first_scene_intent)
        + _viral_base(viral_score)
    )
    return round(min(max(score, 0.0), 10.0), 2)


def score_for_instagram(
    duration: float,
    hook_strength: float,
    energy_level: float,
    viral_score: float,
    first_scene_intent: str,
) -> float:
    """Instagram Reels: visually driven, 15–30s sweet spot."""
    score = (
        _duration_score(duration, "instagram")
        + _hook_score(hook_strength)
        + _energy_score(energy_level, "high")
        + _starts_with_hook(first_scene_intent)
        + _viral_base(viral_score)
    )
    return round(min(max(score, 0.0), 10.0), 2)


def score_for_linkedin(
    duration: float,
    hook_strength: float,
    energy_level: float,
    viral_score: float,
    first_scene_intent: str,
    scene_intent: str = "other",
) -> float:
    """
    LinkedIn: professional/educational content, calm pacing, 30–60s.
    VALUE and STORY intents score higher.
    """
    base = (
        _duration_score(duration, "linkedin")
        + _hook_score(hook_strength)
        + _energy_score(energy_level, "low")
        + _starts_with_hook(first_scene_intent)
        + _viral_base(viral_score)
    )
    # Content-type bonus for LinkedIn
    if scene_intent in {"value", "story"}:
        base += 1.0
    elif scene_intent == "hook":
        base -= 0.5
    return round(min(max(base, 0.0), 10.0), 2)


# ── Unified scorer ────────────────────────────────────────────────────────────

def score_all_platforms(
    duration: float,
    hook_strength: float,
    energy_level: float,
    viral_score: float,
    first_scene_intent: str,
    dominant_intent: str = "other",
    has_speech: bool = True,
) -> PlatformScores:
    """
    Score a short-clip candidate across all 5 platforms.

    Args:
        duration:           Duration in seconds (15–60).
        hook_strength:      0.0–1.0; how strong the opening hook is.
        energy_level:       0.0–1.0; average energy across included scenes.
        viral_score:        0.0–10.0; average viral score of included scenes.
        first_scene_intent: Intent label of the first/dominant scene.
        dominant_intent:    Overall content intent (for LinkedIn scoring).
        has_speech:         Whether the clip has spoken Nepali content
                            (Facebook bonus for native-language content).

    Returns:
        PlatformScores with per-platform floats in [0, 10].
    """
    return PlatformScores(
        youtube=score_for_youtube(
            duration, hook_strength, energy_level, viral_score, first_scene_intent
        ),
        facebook=score_for_facebook(
            duration, hook_strength, energy_level, viral_score,
            first_scene_intent, has_speech=has_speech
        ),
        tiktok=score_for_tiktok(
            duration, hook_strength, energy_level, viral_score, first_scene_intent
        ),
        instagram=score_for_instagram(
            duration, hook_strength, energy_level, viral_score, first_scene_intent
        ),
        linkedin=score_for_linkedin(
            duration, hook_strength, energy_level, viral_score,
            first_scene_intent, scene_intent=dominant_intent
        ),
    )
