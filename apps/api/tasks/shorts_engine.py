"""
ViraEdit — Nepali Shorts Engine.

Extracts 5–10 short-clip candidates (30–240 s tiers) from scene analysis results.
For each candidate it produces:
  • Per-platform scores (YouTube, Facebook, TikTok, Instagram, LinkedIn)
  • 5 Nepali hook template options (Devanagari, no LLM call)
  • 9:16 reframe plan for vertical video (TikTok / Reels)

Design principles:
  • Zero LLM cost — all logic is deterministic or template-based.
  • Nepali hook templates use natural Nepali speech patterns.
  • Facebook scores higher than TikTok for Nepal audience distribution.
  • Candidates are sorted by nepal_weighted_score descending.

Candidate extraction strategy:
  1. Single high-scoring scenes (editorial_adjusted_score ≥ 7.0, 30–240 s)
  2. Consecutive multi-scene windows that fit tier duration budgets
  3. HOOK+VALUE/STORY scene pairs (strong narrative arc)
  4. Best moments by highlight_score (fallback if fewer than 5 candidates)

Output is a list of dicts, each suitable for storage as a "short_clip"
Suggestion record in the DB.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from tasks.platform_scorer import PlatformScores, score_all_platforms

log = logging.getLogger("viraedit.tasks.shorts_engine")

# ── Duration constraints ──────────────────────────────────────────────────────

MIN_SHORT_DURATION: float = 30.0   # seconds (micro tier)
MAX_SHORT_DURATION: float = 240.0  # seconds (extended tier, max 4 min)
IDEAL_SHORT_MIN: float = 45.0      # preferred lower bound (standard tier)
IDEAL_SHORT_MAX: float = 120.0     # preferred upper bound
TIER_MICRO_MAX: float = 60.0
TIER_STANDARD_MAX: float = 120.0

# ── Extraction thresholds ─────────────────────────────────────────────────────

SINGLE_SCENE_MIN_SCORE: float = 6.5    # min editorial score for a single-scene short
MULTI_SCENE_MIN_SCORE: float = 6.0     # min avg score for multi-scene window
MAX_CANDIDATES: int = 10
MIN_CANDIDATES_TARGET: int = 5

# ── Nepali hook templates (5 types) ──────────────────────────────────────────
#
# These are structural Devanagari templates that work for any topic.
# {topic} is replaced with the scene title / summary keyword.
# No LLM call required — fast and $0 cost.
#
# Template types align with the 5 hook types from hooks.py:
#   direct_address, bold_claim, question, statistic, story_tease

NEPALI_HOOK_TEMPLATES: dict[str, str] = {
    "direct_address": "के तपाईंलाई थाहा छ {topic} को बारेमा?",
    # "Do you know about {topic}?"

    "bold_claim":     "{topic} को बारेमा सबैले गलत सोच्छन् — यो हेर्नुस्।",
    # "Everyone thinks wrong about {topic} — watch this."

    "question":       "{topic} कसरी हुन्छ? आज म तपाईंलाई सबै कुरा बताउँछु।",
    # "How does {topic} work? Today I'll tell you everything."

    "statistic":      "धेरैजसो मान्छे {topic} बारे यो गल्ती गर्छन् — तपाईं नगर्नुस्।",
    # "Most people make this mistake about {topic} — don't you."

    "story_tease":    "त्यो दिन मैले {topic} बारे एउटा कुरा सिकें जसले सब कुरा बदल्यो।",
    # "That day I learned something about {topic} that changed everything."
}

HOOK_TEMPLATE_ORDER = [
    "direct_address",
    "bold_claim",
    "question",
    "statistic",
    "story_tease",
]


# ── Dataclass ─────────────────────────────────────────────────────────────────

@dataclass
class ShortCandidate:
    """A short-clip candidate extracted from scene analysis."""

    # Clip boundaries
    scene_indices: list[int]
    start_time: float
    end_time: float

    # Metadata from scenes
    title: str
    summary: str
    transcript_excerpt: str
    dominant_intent: str            # intent of primary scene
    energy_level: float             # average 0–1
    hook_strength: float            # 0–1 — how strong the opening is
    viral_score: float              # average editorial_adjusted_score (0–10)

    # Platform scoring
    platform_scores: PlatformScores = field(default_factory=PlatformScores)

    # Nepali hook templates (5 Devanagari options)
    nepali_hooks: list[str] = field(default_factory=list)

    # Reframe instructions (9:16 vertical)
    reframe: dict[str, Any] = field(default_factory=dict)

    @property
    def duration(self) -> float:
        return round(self.end_time - self.start_time, 2)

    @property
    def duration_tier(self) -> str:
        d = self.duration
        if d <= TIER_MICRO_MAX:
            return "micro"
        if d <= TIER_STANDARD_MAX:
            return "standard"
        return "extended"

    def to_suggestion_action(self) -> dict[str, Any]:
        """Serialise to JSON-safe dict for storing in suggestions.action JSONB."""
        return {
            "type": "short_clip",
            "scene_indices": self.scene_indices,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration": self.duration,
            "duration_tier": self.duration_tier,
            "title": self.title,
            "summary": self.summary,
            "transcript_excerpt": self.transcript_excerpt,
            "dominant_intent": self.dominant_intent,
            "energy_level": round(self.energy_level, 3),
            "hook_strength": round(self.hook_strength, 3),
            "viral_score": round(self.viral_score, 2),
            "platform_scores": self.platform_scores.as_dict(),
            "platform_ranking": self.platform_scores.platform_ranking(),
            "nepal_weighted_score": self.platform_scores.nepal_weighted_score(),
            "best_platform": self.platform_scores.best_platform(),
            "nepali_hooks": self.nepali_hooks,
            "reframe": self.reframe,
        }


# ── Hook generation (template-based, Devanagari) ──────────────────────────────

def generate_nepali_hook_templates(topic: str) -> list[str]:
    """
    Generate 5 Nepali hook options using templates.

    Args:
        topic: Topic keyword from scene title (1–4 words max for natural Nepali).

    Returns:
        List of 5 Devanagari hook strings, one per template type.
    """
    # Truncate topic to keep hooks natural-sounding
    topic_short = " ".join(topic.split()[:4]) if topic else "यो विषय"
    return [
        NEPALI_HOOK_TEMPLATES[t].format(topic=topic_short)
        for t in HOOK_TEMPLATE_ORDER
    ]


# ── Reframe plan (9:16 vertical) ─────────────────────────────────────────────

def plan_reframe(
    energy_level: float,
    dominant_intent: str,
    duration: float,
) -> dict[str, Any]:
    """
    Generate 9:16 reframe instructions for a short clip.

    For high-energy clips → center crop (keeps action in frame).
    For calm/talking-head clips → speaker tracking with slight zoom.

    Args:
        energy_level:     0.0–1.0 from scene data.
        dominant_intent:  Scene intent string.
        duration:         Clip duration in seconds.

    Returns:
        Dict with aspect_ratio, strategy, ffmpeg_filter, and instructions.
    """
    if energy_level >= 0.7 or dominant_intent in {"hook", "cta"}:
        strategy = "center_crop"
        ffmpeg_filter = "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920"
        instructions = (
            "Center-crop to 9:16. Speaker is likely centered. "
            "No repositioning needed."
        )
    else:
        strategy = "speaker_track"
        ffmpeg_filter = (
            "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,"
            "scale=1080:1920,"
            "zoompan=z=1.05:d=1:s=1080x1920"
        )
        instructions = (
            "Apply gentle zoom (1.05×) toward speaker face area. "
            "Center-crop for talking-head content."
        )

    return {
        "aspect_ratio": "9:16",
        "output_resolution": "1080x1920",
        "strategy": strategy,
        "ffmpeg_filter": ffmpeg_filter,
        "instructions": instructions,
        "platforms": ["tiktok", "instagram", "facebook"],
        "estimated_crop_loss_pct": 44,  # 16:9 → 9:16 loses ~44% of width
        "pan_x": 0.5,
    }


def short_crop_filter(
    pan_x: float = 0.5,
    out_width: int = 1080,
    out_height: int = 1920,
) -> str:
    """
    FFmpeg filter: crop a 9:16 window from 16:9 source at horizontal pan_x (0–1).
    """
    px = max(0.0, min(1.0, float(pan_x)))
    return (
        f"crop=ih*9/16:ih:(iw-ih*9/16)*{px:.4f}:0,"
        f"scale={out_width}:{out_height},setsar=1"
    )


def short_color_filter(filter_id: str | None) -> str:
    """FFmpeg color grade fragment for short-only filters."""
    mapping = {
        "warm": "eq=saturation=1.15:gamma=1.05",
        "cold": "eq=saturation=0.85:gamma_b=1.08",
        "vintage": "colorbalance=rs=0.08:gs=0.04:bs=-0.08",
        "dramatic": "eq=contrast=1.25:saturation=0.85",
        "bw": "hue=s=0",
        "vibrant": "eq=saturation=1.45:contrast=1.08",
        "fade": "eq=brightness=0.06:contrast=0.92:saturation=0.88",
    }
    if not filter_id or filter_id == "none":
        return ""
    return mapping.get(filter_id, "")


def short_speed_multiplier(styling: dict | None) -> float:
    """Read speed multiplier from short_styling export payload."""
    if not styling:
        return 1.0
    mult = styling.get("speed_multiplier")
    if mult is not None:
        try:
            m = float(mult)
            return max(0.25, min(4.0, m))
        except (TypeError, ValueError):
            pass
    speed_id = styling.get("speed_id")
    speed_map = {
        "normal": 1.0,
        "fast-2x": 2.0,
        "fast-3x": 3.0,
        "slow-2x": 0.5,
        "slow-4x": 0.25,
    }
    return speed_map.get(str(speed_id or ""), 1.0)


def build_short_video_filter(
    pan_x: float,
    width: int,
    height: int,
    styling: dict | None,
) -> str:
    """Full vf chain: crop, scale, optional color filter."""
    parts = [short_crop_filter(pan_x, width, height)]
    if styling:
        cf = short_color_filter(styling.get("filter_id"))
        if cf:
            parts.append(cf)
    return ",".join(parts)


# ── Hook strength estimation ──────────────────────────────────────────────────

def _estimate_hook_strength(
    scenes: list[dict],
    candidate_indices: list[int],
) -> float:
    """
    Estimate how strong the opening hook is for this candidate (0–1).

    Rules:
    - First scene intent = "hook" → 0.9
    - First scene intent = "value" → 0.65
    - First scene intent = "story" → 0.6
    - First scene highlight_score > 0.7 → bonus +0.15
    - First scene energy_level > 0.7 → bonus +0.10
    """
    if not candidate_indices:
        return 0.3
    first = scenes[candidate_indices[0]]
    intent = first.get("intent", "other")
    highlight = float(first.get("highlight_score", 0.5))
    energy = float(first.get("energy_level", 0.5))

    base = {
        "hook": 0.9,
        "value": 0.65,
        "story": 0.60,
        "problem": 0.55,
        "cta": 0.35,
        "filler": 0.1,
        "other": 0.4,
    }.get(intent, 0.4)

    if highlight > 0.7:
        base += 0.1
    if energy > 0.7:
        base += 0.08

    return round(min(base, 1.0), 3)


# ── Candidate extraction ──────────────────────────────────────────────────────

def _average_score(scenes: list[dict], indices: list[int]) -> float:
    """Average editorial_adjusted_score (falls back to highlight_score × 10)."""
    if not indices:
        return 0.0
    scores = []
    for i in indices:
        s = scenes[i]
        score = s.get("editorial_adjusted_score")
        if score is None:
            score = float(s.get("highlight_score", 0.5)) * 10.0
        scores.append(float(score))
    return round(sum(scores) / len(scores), 2)


def _average_energy(scenes: list[dict], indices: list[int]) -> float:
    if not indices:
        return 0.5
    vals = [float(scenes[i].get("energy_level", 0.5)) for i in indices]
    return round(sum(vals) / len(vals), 3)


def _dominant_intent(scenes: list[dict], indices: list[int]) -> str:
    """Return the most common non-filler intent among the candidate scenes."""
    from collections import Counter
    intents = [scenes[i].get("intent", "other") for i in indices]
    non_filler = [i for i in intents if i != "filler"]
    if not non_filler:
        return "other"
    return Counter(non_filler).most_common(1)[0][0]


def _make_candidate(
    scenes: list[dict],
    indices: list[int],
) -> ShortCandidate | None:
    """
    Build a ShortCandidate from a list of scene indices.
    Returns None if the candidate duration is outside 30–240 s.
    """
    if not indices:
        return None

    first = scenes[indices[0]]
    last = scenes[indices[-1]]
    start_time = float(first.get("start_time", 0.0))
    end_time = float(last.get("end_time", 0.0))
    duration = end_time - start_time

    if duration < MIN_SHORT_DURATION or duration > MAX_SHORT_DURATION:
        return None

    # Prefer the highest-scoring scene title as the topic for hook templates
    best_idx = max(indices, key=lambda i: _average_score(scenes, [i]))
    best_scene = scenes[best_idx]
    title = best_scene.get("title", "")
    summary = " ".join(
        scenes[i].get("summary", "") for i in indices
    )[:200]
    transcript_excerpt = " ".join(
        scenes[i].get("transcript_excerpt", "") for i in indices
    )[:400]

    viral_score = _average_score(scenes, indices)
    energy_level = _average_energy(scenes, indices)
    intent = _dominant_intent(scenes, indices)
    hook_strength = _estimate_hook_strength(scenes, indices)
    first_intent = scenes[indices[0]].get("intent", "other")

    platform_scores = score_all_platforms(
        duration=duration,
        hook_strength=hook_strength,
        energy_level=energy_level,
        viral_score=viral_score,
        first_scene_intent=first_intent,
        dominant_intent=intent,
        has_speech=True,  # All ViraEdit content is Nepali speech
    )

    nepali_hooks = generate_nepali_hook_templates(title or summary[:40])
    reframe = plan_reframe(energy_level, intent, duration)

    return ShortCandidate(
        scene_indices=indices,
        start_time=round(start_time, 3),
        end_time=round(end_time, 3),
        title=title,
        summary=summary,
        transcript_excerpt=transcript_excerpt,
        dominant_intent=intent,
        energy_level=energy_level,
        hook_strength=hook_strength,
        viral_score=viral_score,
        platform_scores=platform_scores,
        nepali_hooks=nepali_hooks,
        reframe=reframe,
    )


# ── Deduplication ─────────────────────────────────────────────────────────────

def _overlaps(a: ShortCandidate, b: ShortCandidate, threshold: float = 0.4) -> bool:
    """
    True if a and b overlap by more than `threshold` fraction of the shorter one.
    """
    overlap = min(a.end_time, b.end_time) - max(a.start_time, b.start_time)
    if overlap <= 0:
        return False
    shorter_dur = min(a.duration, b.duration)
    return shorter_dur > 0 and (overlap / shorter_dur) > threshold


def _deduplicate(candidates: list[ShortCandidate]) -> list[ShortCandidate]:
    """
    Remove overlapping candidates, keeping the higher-scoring one.
    """
    # Sort by nepal_weighted_score descending
    sorted_cands = sorted(
        candidates,
        key=lambda c: c.platform_scores.nepal_weighted_score(),
        reverse=True,
    )
    kept: list[ShortCandidate] = []
    for cand in sorted_cands:
        if not any(_overlaps(cand, kept_cand) for kept_cand in kept):
            kept.append(cand)
    return kept


# ── Main extraction function ──────────────────────────────────────────────────

def extract_short_candidates(
    scenes: list[dict],
    min_duration: float = MIN_SHORT_DURATION,
    max_duration: float = MAX_SHORT_DURATION,
) -> list[ShortCandidate]:
    """
    Extract 5–10 short-clip candidates from scene analysis data.

    Strategy (in priority order):
    1. Single high-scoring scenes (score ≥ 6.5, 15–60 s)
    2. HOOK+VALUE/STORY consecutive scene pairs
    3. Sliding window of 2–4 scenes in 15–60 s range
    4. Best moments by highlight_score (fallback padding)

    Args:
        scenes:       List of scene dicts from analyze.py (with intent,
                      editorial_adjusted_score, energy_level, etc.).
        min_duration: Minimum clip duration in seconds (default 15).
        max_duration: Maximum clip duration in seconds (default 60).

    Returns:
        List of ShortCandidate objects, sorted by nepal_weighted_score,
        deduplicated, capped at MAX_CANDIDATES.
    """
    if not scenes:
        return []

    candidates: list[ShortCandidate] = []
    seen_sets: set[tuple] = set()

    def _add_candidate(indices: list[int]) -> None:
        key = tuple(sorted(indices))
        if key in seen_sets:
            return
        seen_sets.add(key)
        c = _make_candidate(scenes, indices)
        if c is not None:
            candidates.append(c)

    # ── Strategy 1: single scenes ─────────────────────────────────────────────
    for i, scene in enumerate(scenes):
        score = scene.get("editorial_adjusted_score") or (
            float(scene.get("highlight_score", 0.5)) * 10.0
        )
        dur = float(scene.get("end_time", 0.0)) - float(scene.get("start_time", 0.0))
        if (
            float(score) >= SINGLE_SCENE_MIN_SCORE
            and min_duration <= dur <= max_duration
        ):
            _add_candidate([i])

    # ── Strategy 2: HOOK + VALUE/STORY pairs ──────────────────────────────────
    for i in range(len(scenes) - 1):
        s1 = scenes[i]
        s2 = scenes[i + 1]
        if s1.get("intent") == "hook" and s2.get("intent") in {"value", "story", "problem"}:
            _add_candidate([i, i + 1])
        # Also try PROBLEM + VALUE
        if s1.get("intent") == "problem" and s2.get("intent") == "value":
            _add_candidate([i, i + 1])

    # ── Strategy 3: sliding window (2–4 consecutive scenes) ──────────────────
    for window_size in range(2, 5):
        for i in range(len(scenes) - window_size + 1):
            indices = list(range(i, i + window_size))
            avg_score = _average_score(scenes, indices)
            if avg_score >= MULTI_SCENE_MIN_SCORE:
                _add_candidate(indices)

    # ── Strategy 4: fallback — top scenes by highlight_score ─────────────────
    if len(candidates) < MIN_CANDIDATES_TARGET:
        sorted_by_score = sorted(
            range(len(scenes)),
            key=lambda i: float(
                scenes[i].get("editorial_adjusted_score")
                or float(scenes[i].get("highlight_score", 0)) * 10
            ),
            reverse=True,
        )
        for i in sorted_by_score:
            if len(candidates) >= MIN_CANDIDATES_TARGET:
                break
            _add_candidate([i])

    # ── Deduplicate, sort, cap ────────────────────────────────────────────────
    unique = _deduplicate(candidates)
    unique.sort(
        key=lambda c: c.platform_scores.nepal_weighted_score(),
        reverse=True,
    )
    result = unique[:MAX_CANDIDATES]

    log.info(
        "shorts_extraction_complete: found=%d before_dedup=%d",
        len(result),
        len(candidates),
    )
    return result


# ── Public entry point ────────────────────────────────────────────────────────

def run_shorts_engine(
    scenes: list[dict],
    content_type: str = "other",
    total_duration: float = 0.0,
) -> list[dict]:
    """
    Main entry point called from analyze.py.

    Args:
        scenes:         Enriched scene dicts (after editorial scoring).
        content_type:   Detected content type ("podcast", "vlog", etc.).
        total_duration: Total video duration in seconds.

    Returns:
        List of suggestion-action dicts ready for DB storage as "short_clip" suggestions.
    """
    candidates = extract_short_candidates(scenes)

    enrich_action = lambda action, _c: action
    try:
        from tasks.topic_shorts import extract_topic_shorts, enrich_action_with_compilation
        enrich_action = enrich_action_with_compilation
        topic_cands = extract_topic_shorts(scenes)
        seen_ranges = {(c.start_time, c.end_time) for c in candidates}
        for tc in topic_cands:
            key = (tc.start_time, tc.end_time)
            if key not in seen_ranges:
                candidates.insert(0, tc)
                seen_ranges.add(key)
        candidates = _deduplicate(candidates)[:MAX_CANDIDATES]
    except Exception as exc:
        log.warning("topic_shorts_failed: %s", exc)

    log.info(
        "shorts_engine_done: candidates=%d content_type=%s duration=%.1fs",
        len(candidates),
        content_type,
        total_duration,
    )

    actions = []
    for c in candidates:
        action = enrich_action(c.to_suggestion_action(), c)
        actions.append(action)
    return actions
