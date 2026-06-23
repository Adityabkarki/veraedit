"""
ViraEdit — Editorial engine with Nepali content-type profiles.

Applies editorial rules to scenes based on detected content type:
  podcast    — long-form, conversational, value-heavy; penalise short scenes
  tutorial   — structured, step-by-step; reward VALUE intent scenes
  vlog       — personal/story heavy; reward STORY and HOOK intents
  shorts     — fast-paced; penalise scenes > 60s, reward scenes < 30s
  interview  — two speakers; reward dynamic exchanges
  other      — no adjustments

Also provides J-cut / L-cut planning:
  J-cut — audio from next scene starts before its video (feel of flow)
  L-cut — audio from current scene continues into next scene's video
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# ── Content type profiles ─────────────────────────────────────────────────────

@dataclass
class ContentProfile:
    """Scoring adjustments for a content type."""
    name: str
    ideal_scene_min_s: float   # scenes shorter than this get penalised
    ideal_scene_max_s: float   # scenes longer than this get penalised
    intent_boost: dict[str, float]   # intent → score multiplier
    shorts_threshold: float          # scenes above this go_shorts score qualify
    cta_expected: bool               # True = penalise if no CTA scene found
    description: str


CONTENT_PROFILES: dict[str, ContentProfile] = {
    "podcast": ContentProfile(
        name="podcast",
        ideal_scene_min_s=30.0,
        ideal_scene_max_s=180.0,
        intent_boost={"value": 1.3, "story": 1.2, "hook": 1.1, "filler": 0.5},
        shorts_threshold=7.0,
        cta_expected=True,
        description="Long-form conversational content; reward insight-rich scenes",
    ),
    "tutorial": ContentProfile(
        name="tutorial",
        ideal_scene_min_s=20.0,
        ideal_scene_max_s=120.0,
        intent_boost={"value": 1.4, "problem": 1.2, "hook": 1.1, "filler": 0.4},
        shorts_threshold=6.5,
        cta_expected=True,
        description="Step-by-step teaching content; heavily reward value scenes",
    ),
    "vlog": ContentProfile(
        name="vlog",
        ideal_scene_min_s=15.0,
        ideal_scene_max_s=90.0,
        intent_boost={"story": 1.4, "hook": 1.3, "value": 1.1, "filler": 0.6},
        shorts_threshold=7.5,
        cta_expected=False,
        description="Personal content; reward authentic story moments",
    ),
    "shorts": ContentProfile(
        name="shorts",
        ideal_scene_min_s=5.0,
        ideal_scene_max_s=60.0,
        intent_boost={"hook": 1.5, "value": 1.2, "story": 1.1, "filler": 0.3},
        shorts_threshold=8.0,
        cta_expected=False,
        description="Fast-paced short-form; penalise anything over 60s",
    ),
    "interview": ContentProfile(
        name="interview",
        ideal_scene_min_s=20.0,
        ideal_scene_max_s=150.0,
        intent_boost={"story": 1.3, "problem": 1.2, "hook": 1.1, "filler": 0.5},
        shorts_threshold=7.0,
        cta_expected=True,
        description="Two-speaker dialogue; reward dynamic exchanges",
    ),
    "other": ContentProfile(
        name="other",
        ideal_scene_min_s=15.0,
        ideal_scene_max_s=120.0,
        intent_boost={},
        shorts_threshold=7.0,
        cta_expected=False,
        description="No special adjustments",
    ),
}


# ── Score adjustment ──────────────────────────────────────────────────────────

def adjust_scene_scores(
    scenes: list[dict[str, Any]],
    content_type: str,
    overall_viral_score: float,
) -> list[dict[str, Any]]:
    """
    Apply content-type editorial rules to scene scores.

    Modifies each scene dict in place, adding:
      editorial_adjusted_score — float (0–10), adjusted from shorts platform score
      editorial_notes          — list[str] of reasons for adjustment
      qualifies_for_short      — bool

    Args:
        scenes:              Scene dicts from Claude analysis + intent classification.
        content_type:        Detected content type string.
        overall_viral_score: The overall video viral score (0–10).

    Returns:
        Modified scenes list.
    """
    profile = CONTENT_PROFILES.get(content_type, CONTENT_PROFILES["other"])

    for scene in scenes:
        notes: list[str] = []
        duration = (scene.get("end_time", 0) - scene.get("start_time", 0))
        base_score = scene.get("platform_scores", {}).get("shorts", 5.0)
        adjusted = base_score

        # Intent boost/penalty
        intent = scene.get("intent", "other")
        if intent in profile.intent_boost:
            mult = profile.intent_boost[intent]
            adjusted *= mult
            if mult > 1.0:
                notes.append(f"{intent} scene boosted for {content_type} content")
            elif mult < 1.0:
                notes.append(f"{intent} scene penalised for {content_type} content")

        # Duration penalty
        if duration < profile.ideal_scene_min_s:
            penalty = 0.8
            adjusted *= penalty
            notes.append(f"Scene too short ({duration:.0f}s < {profile.ideal_scene_min_s:.0f}s ideal)")
        elif duration > profile.ideal_scene_max_s:
            # Scale penalty with how far over the limit
            ratio = profile.ideal_scene_max_s / duration
            adjusted *= ratio
            notes.append(f"Scene too long ({duration:.0f}s > {profile.ideal_scene_max_s:.0f}s ideal)")

        # Clamp to 0–10
        adjusted = max(0.0, min(10.0, adjusted))

        scene["editorial_adjusted_score"] = round(adjusted, 2)
        scene["editorial_notes"] = notes
        scene["qualifies_for_short"] = adjusted >= profile.shorts_threshold

    return scenes


# ── CTA check ────────────────────────────────────────────────────────────────

def check_cta_presence(
    scenes: list[dict[str, Any]],
    content_type: str,
) -> dict[str, Any]:
    """
    Check whether a CTA scene exists and return a finding dict.

    Returns:
        {has_cta: bool, cta_scene_index: int|None, recommendation: str}
    """
    profile = CONTENT_PROFILES.get(content_type, CONTENT_PROFILES["other"])
    cta_index = next(
        (i for i, s in enumerate(scenes) if s.get("intent") == "cta"),
        None,
    )
    has_cta = cta_index is not None
    recommendation = ""
    if not has_cta and profile.cta_expected:
        recommendation = (
            "No CTA scene detected. Consider adding a subscribe/follow prompt "
            "at the end of the video — it improves channel growth significantly."
        )
    return {
        "has_cta": has_cta,
        "cta_scene_index": cta_index,
        "recommendation": recommendation,
    }


# ── J-cut / L-cut planning ────────────────────────────────────────────────────

@dataclass
class CutPlan:
    """A planned J-cut or L-cut between two scenes."""
    cut_type: str           # "j_cut" or "l_cut"
    scene_index: int        # the scene before the cut
    overlap_s: float        # how many seconds of audio overlap
    reason: str


def plan_jl_cuts(
    scenes: list[dict[str, Any]],
    content_type: str,
) -> list[dict[str, Any]]:
    """
    Suggest J-cuts and L-cuts between scenes.

    J-cut: audio from scene N+1 starts before its video (audio leads video)
    L-cut: audio from scene N continues into scene N+1's video (audio lags)

    Returns:
        List of CutPlan dicts.
    """
    cuts: list[dict[str, Any]] = []
    if len(scenes) < 2:
        return cuts

    for i in range(len(scenes) - 1):
        curr = scenes[i]
        nxt = scenes[i + 1]
        curr_intent = curr.get("intent", "other")
        next_intent = nxt.get("intent", "other")

        # J-cut: when next scene is VALUE or STORY, bring its audio in early
        # — feels like the conversation is already flowing
        if next_intent in ("value", "story") and curr_intent in ("hook", "problem"):
            cuts.append({
                "cut_type": "j_cut",
                "scene_index": i,
                "overlap_s": 1.5,
                "reason": (
                    f"J-cut into {next_intent} scene — start audio 1.5s before "
                    "video cut to create natural flow from hook/problem setup."
                ),
            })

        # L-cut: when current scene has a strong highlight, let audio linger
        elif curr.get("is_highlight") and curr_intent in ("story", "value"):
            cuts.append({
                "cut_type": "l_cut",
                "scene_index": i,
                "overlap_s": 1.0,
                "reason": (
                    "L-cut after highlight scene — keep audio 1s into next "
                    "scene to let the moment breathe."
                ),
            })

    return cuts
