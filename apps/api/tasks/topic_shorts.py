"""
ViraEdit — Topic Short Compiler.

Finds topics discussed in multiple places across a long video and compiles
one short (30s–3min) from non-contiguous segments.

Used by shorts_engine.run_shorts_engine() alongside single-window extraction.
"""
from __future__ import annotations

import logging
import re
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from tasks.platform_scorer import score_all_platforms
from tasks.shorts_engine import (
    ShortCandidate,
    generate_nepali_hook_templates,
    plan_reframe,
    _average_energy,
    _average_score,
    _deduplicate,
    _dominant_intent,
    _estimate_hook_strength,
)

log = logging.getLogger("viraedit.tasks.topic_shorts")

TOPIC_MIN_DURATION = 30.0
TOPIC_MAX_DURATION = 180.0
TOPIC_MAX_SEGMENTS = 6
TOPIC_MIN_SCENES = 1


@dataclass
class TopicSegment:
    start_time: float
    end_time: float
    scene_index: int

    @property
    def duration(self) -> float:
        return max(0.0, self.end_time - self.start_time)


@dataclass
class TopicShortCandidate:
    """Multi-segment short compiled around one topic."""

    topic_key: str
    topic_label: str
    segments: list[TopicSegment] = field(default_factory=list)
    scene_indices: list[int] = field(default_factory=list)

    @property
    def play_duration(self) -> float:
        return round(sum(s.duration for s in self.segments), 2)

    @property
    def start_time(self) -> float:
        return self.segments[0].start_time if self.segments else 0.0

    @property
    def end_time(self) -> float:
        return self.segments[-1].end_time if self.segments else 0.0


def _normalize_topic(raw: str) -> str:
    """Normalize topic string for grouping."""
    s = (raw or "").strip().lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s[:80]


def _topic_keys_for_scene(scene: dict) -> list[str]:
    keys: list[str] = []
    for t in scene.get("topics") or []:
        if isinstance(t, str) and t.strip():
            keys.append(_normalize_topic(t))
    title = scene.get("title") or ""
    if title.strip():
        # First 3 words of title as secondary topic key
        short = _normalize_topic(" ".join(title.split()[:3]))
        if short and short not in keys:
            keys.append(short)
    return keys or [_normalize_topic(title) or "general"]


def _scene_score(scene: dict) -> float:
    score = scene.get("editorial_adjusted_score")
    if score is not None:
        return float(score)
    return float(scene.get("highlight_score", 0.5)) * 10.0


def group_scenes_by_topic(scenes: list[dict]) -> dict[str, list[int]]:
    """Map normalized topic → scene indices (may be non-contiguous)."""
    groups: dict[str, list[int]] = defaultdict(list)
    for i, scene in enumerate(scenes):
        for key in _topic_keys_for_scene(scene):
            if i not in groups[key]:
                groups[key].append(i)
    return dict(groups)


def _pick_segments_for_topic(
    scenes: list[dict],
    indices: list[int],
    max_duration: float = TOPIC_MAX_DURATION,
) -> list[TopicSegment]:
    """
    Pick highest-scoring scenes for this topic until duration budget filled.
    Allows non-adjacent segments (sorted by time for playback order).
    """
    ranked = sorted(indices, key=lambda i: _scene_score(scenes[i]), reverse=True)
    segments: list[TopicSegment] = []
    total = 0.0

    for idx in ranked:
        if len(segments) >= TOPIC_MAX_SEGMENTS:
            break
        scene = scenes[idx]
        dur = float(scene.get("end_time", 0)) - float(scene.get("start_time", 0))
        if dur <= 0:
            continue
        if total + dur > max_duration and segments:
            # Trim last segment partially if we're close to budget
            remaining = max_duration - total
            if remaining >= 5.0:
                segments.append(TopicSegment(
                    start_time=float(scene.get("start_time", 0)),
                    end_time=float(scene.get("start_time", 0)) + remaining,
                    scene_index=idx,
                ))
                total += remaining
            break
        segments.append(TopicSegment(
            start_time=float(scene.get("start_time", 0)),
            end_time=float(scene.get("end_time", 0)),
            scene_index=idx,
        ))
        total += dur
        if total >= TOPIC_MIN_DURATION and total >= max_duration * 0.85:
            break

    segments.sort(key=lambda s: s.start_time)
    return segments


def topic_short_to_candidate(
    topic_key: str,
    topic_label: str,
    scenes: list[dict],
    segments: list[TopicSegment],
) -> ShortCandidate | None:
    if not segments:
        return None

    play_dur = sum(s.duration for s in segments)
    if play_dur < TOPIC_MIN_DURATION:
        return None

    scene_indices = sorted({s.scene_index for s in segments})
    energy = _average_energy(scenes, scene_indices)
    intent = _dominant_intent(scenes, scene_indices)
    hook_strength = _estimate_hook_strength(scenes, scene_indices)
    viral_score = _average_score(scenes, scene_indices)
    first_intent = scenes[scene_indices[0]].get("intent", "other")

    summary_parts = [
        scenes[i].get("summary", "") for i in scene_indices[:4]
    ]
    summary = " ".join(p for p in summary_parts if p)[:300]
    excerpt = " ".join(
        scenes[i].get("transcript_excerpt", "") for i in scene_indices[:3]
    )[:500]

    title = topic_label.replace("-", " ").title() if topic_label else "Topic Short"
    platform_scores = score_all_platforms(
        duration=play_dur,
        hook_strength=hook_strength,
        energy_level=energy,
        viral_score=viral_score,
        first_scene_intent=first_intent,
        dominant_intent=intent,
        has_speech=True,
    )

    # Bonus for multi-moment compilation (more Opus-like)
    if len(segments) >= 2:
        platform_scores.youtube = min(10.0, platform_scores.youtube + 0.5)
        platform_scores.tiktok = min(10.0, platform_scores.tiktok + 0.3)

    candidate = ShortCandidate(
        scene_indices=scene_indices,
        start_time=segments[0].start_time,
        end_time=segments[-1].end_time,
        title=title,
        summary=summary or f"Compiled short about {title}",
        transcript_excerpt=excerpt,
        dominant_intent=intent,
        energy_level=energy,
        hook_strength=hook_strength,
        viral_score=viral_score,
        platform_scores=platform_scores,
        nepali_hooks=generate_nepali_hook_templates(title),
        reframe=plan_reframe(energy, intent, play_dur),
    )
    return candidate


def extract_topic_shorts(scenes: list[dict]) -> list[ShortCandidate]:
    """
    Build topic-compiled short candidates from scene analysis.

    Returns candidates with extra metadata attached via monkey-patched fields
    stored in summary (segments serialized in to_suggestion_action patch).
    """
    if not scenes:
        return []

    groups = group_scenes_by_topic(scenes)
    candidates: list[ShortCandidate] = []

    for topic_key, indices in groups.items():
        if len(indices) < 1:
            continue
        # Prefer topics that appear in multiple places (user requirement)
        segments = _pick_segments_for_topic(scenes, indices)
        if len(segments) < 1:
            continue
        play_dur = sum(s.duration for s in segments)
        if play_dur < TOPIC_MIN_DURATION:
            continue

        label = topic_key.replace("_", " ")
        cand = topic_short_to_candidate(topic_key, label, scenes, segments)
        if cand:
            # Attach compilation metadata (used by to_suggestion_action wrapper)
            cand._topic_segments = [  # type: ignore[attr-defined]
                {"start_time": s.start_time, "end_time": s.end_time, "scene_index": s.scene_index}
                for s in segments
            ]
            cand._compilation_type = "topic_compiled"  # type: ignore[attr-defined]
            cand._segment_count = len(segments)  # type: ignore[attr-defined]
            candidates.append(cand)

    # Prefer multi-segment compilations, then score
    candidates.sort(
        key=lambda c: (
            getattr(c, "_segment_count", 1),
            c.platform_scores.nepal_weighted_score(),
        ),
        reverse=True,
    )

    unique = _deduplicate(candidates)
    log.info(
        "topic_shorts_extracted: topics=%d candidates=%d",
        len(groups),
        len(unique),
    )
    return unique[:8]


def enrich_action_with_compilation(action: dict[str, Any], candidate: ShortCandidate) -> dict[str, Any]:
    """Add multi-segment fields to suggestion action if present."""
    segs = getattr(candidate, "_topic_segments", None)
    if segs:
        action["compilation_type"] = getattr(candidate, "_compilation_type", "topic_compiled")
        action["segments"] = segs
        action["play_duration"] = round(sum(s["end_time"] - s["start_time"] for s in segs), 2)
        action["segment_count"] = len(segs)
        action["description_hint"] = f"Compiled from {len(segs)} moments about {action.get('title', 'this topic')}"
    return action
