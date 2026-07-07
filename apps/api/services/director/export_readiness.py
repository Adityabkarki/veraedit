"""
Pre-export completeness gate — Production Completeness Law Phase 6.

Distinct from validate_timeline.py (integration laws). This scan catches
coverage gaps on real long-form content before export is offered.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from services.director.broll_confidence import PARTIAL_THRESHOLD

STATIC_STRETCH_SECONDS = 45.0
HIGH_CONFIDENCE_SUPPRESSED = 0.75
NEARBY_FALLBACK_SECONDS = 12.0

IssueKind = Literal[
    "static_stretch",
    "low_confidence_broll",
    "suppressed_no_fallback",
    "style_shallow",
]


@dataclass
class CompletenessIssue:
    id: str
    kind: IssueKind
    message: str
    start_seconds: float
    end_seconds: float
    auto_resolvable: bool
    resolved: bool = False
    resolution: str | None = None


@dataclass
class ExportReadinessReport:
    ready: bool
    issues: list[CompletenessIssue] = field(default_factory=list)
    auto_fixes_applied: int = 0
    checklist: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "ready": self.ready,
            "issueCount": len(self.issues),
            "unresolvedCount": sum(1 for i in self.issues if not i.resolved),
            "autoFixesApplied": self.auto_fixes_applied,
            "checklist": self.checklist,
            "issues": [
                {
                    "id": i.id,
                    "kind": i.kind,
                    "message": i.message,
                    "startSeconds": round(i.start_seconds, 2),
                    "endSeconds": round(i.end_seconds, 2),
                    "autoResolvable": i.auto_resolvable,
                    "resolved": i.resolved,
                    "resolution": i.resolution,
                }
                for i in self.issues
            ],
        }


def check_export_readiness(
    timeline: dict[str, Any],
    *,
    auto_resolve: bool = False,
) -> tuple[ExportReadinessReport, dict[str, Any]]:
    """
    Scan compiled DirectorTimeline for completeness gaps.

    When auto_resolve=True, inserts Topic Title Cards for static stretches
    and logs each change. Returns (report, possibly_modified_timeline).
    """
    import copy

    working = copy.deepcopy(timeline)
    fps = float(working.get("fps") or 30)
    duration_frames = int(working.get("durationInFrames") or 0)
    duration_seconds = duration_frames / fps if fps else 0.0

    auto_fixes = 0
    if auto_resolve:
        for _ in range(25):
            issues = _collect_issues(working, fps, duration_seconds)
            fixed_any = False
            for issue in issues:
                if issue.kind == "static_stretch" and issue.auto_resolvable:
                    if _insert_static_stretch_fix(working, issue, fps):
                        auto_fixes += 1
                        fixed_any = True
                        break
                elif issue.kind == "suppressed_no_fallback":
                    if _insert_fallback_near_suppressed(working, issue, fps):
                        auto_fixes += 1
                        fixed_any = True
                        break
            if not fixed_any:
                break

    issues = _collect_issues(working, fps, duration_seconds)
    unresolved = [i for i in issues if not i.resolved]
    checklist = [_issue_to_checklist_line(i) for i in unresolved]

    report = ExportReadinessReport(
        ready=len(unresolved) == 0,
        issues=issues,
        auto_fixes_applied=auto_fixes,
        checklist=checklist,
    )
    return report, working


def _collect_issues(
    timeline: dict[str, Any],
    fps: float,
    duration_seconds: float,
) -> list[CompletenessIssue]:
    issues: list[CompletenessIssue] = []
    issues.extend(_find_static_stretches(timeline, fps, duration_seconds))
    issues.extend(_find_low_confidence_broll(timeline, fps))
    issues.extend(_find_suppressed_without_fallback(timeline, fps))
    issues.extend(_find_shallow_style(timeline))
    return issues


def _visual_events(timeline: dict[str, Any], fps: float) -> list[tuple[float, float]]:
    """Collect time ranges with motion, B-roll, transitions, VFX, or multicam changes."""
    events: list[tuple[float, float]] = []
    tracks = timeline.get("tracks") or {}

    def add_frames(start: int, dur: int) -> None:
        if dur <= 0:
            return
        events.append((start / fps, (start + dur) / fps))

    for entry in tracks.get("motionGraphics") or []:
        add_frames(int(entry.get("startFrame") or 0), int(entry.get("durationInFrames") or 0))
    for entry in tracks.get("broll") or []:
        add_frames(int(entry.get("startFrame") or 0), int(entry.get("durationInFrames") or 0))
    for entry in tracks.get("transitions") or []:
        add_frames(int(entry.get("startFrame") or 0), int(entry.get("durationInFrames") or 0))
    for entry in tracks.get("vfx") or []:
        add_frames(int(entry.get("startFrame") or 0), int(entry.get("durationInFrames") or 0))
    for entry in tracks.get("multicam") or []:
        add_frames(int(entry.get("startFrame") or 0), int(entry.get("durationInFrames") or 0))
    for clip in tracks.get("video") or []:
        if clip.get("cameraMotion"):
            add_frames(int(clip.get("startFrame") or 0), int(clip.get("durationInFrames") or 0))

    return sorted(events)


def _find_static_stretches(
    timeline: dict[str, Any],
    fps: float,
    duration_seconds: float,
) -> list[CompletenessIssue]:
    if duration_seconds <= STATIC_STRETCH_SECONDS:
        return []

    events = _visual_events(timeline, fps)
    issues: list[CompletenessIssue] = []
    cursor = 0.0

    merged: list[tuple[float, float]] = []
    for start, end in events:
        if not merged or start > merged[-1][1]:
            merged.append((start, end))
        else:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))

    for start, end in merged:
        gap = start - cursor
        if gap >= STATIC_STRETCH_SECONDS:
            issues.append(
                CompletenessIssue(
                    id=f"static-{int(cursor)}",
                    kind="static_stretch",
                    message=(
                        f"No visual variety for {gap:.0f}s "
                        f"({cursor:.0f}s–{start:.0f}s) — consider B-roll or a title card"
                    ),
                    start_seconds=cursor,
                    end_seconds=start,
                    auto_resolvable=True,
                )
            )
        cursor = max(cursor, end)

    tail_gap = duration_seconds - cursor
    if tail_gap >= STATIC_STRETCH_SECONDS:
        issues.append(
            CompletenessIssue(
                id=f"static-tail-{int(cursor)}",
                kind="static_stretch",
                message=(
                    f"Final segment has no visual variety for {tail_gap:.0f}s "
                    f"— want a title card or B-roll automatically?"
                ),
                start_seconds=cursor,
                end_seconds=duration_seconds,
                auto_resolvable=True,
            )
        )
    return issues


def _find_low_confidence_broll(timeline: dict[str, Any], fps: float) -> list[CompletenessIssue]:
    issues: list[CompletenessIssue] = []
    for entry in (timeline.get("tracks") or {}).get("broll") or []:
        score = entry.get("matchConfidence")
        if score is None:
            continue
        if float(score) >= PARTIAL_THRESHOLD:
            continue
        start = int(entry.get("startFrame") or 0) / fps
        end = start + int(entry.get("durationInFrames") or 0) / fps
        issues.append(
            CompletenessIssue(
                id=f"broll-low-{entry.get('id')}",
                kind="low_confidence_broll",
                message=(
                    f"B-roll '{entry.get('searchQuery')}' scored {score} "
                    f"(below {PARTIAL_THRESHOLD}) — review relevance"
                ),
                start_seconds=start,
                end_seconds=end,
                auto_resolvable=False,
            )
        )
    return issues


def _find_suppressed_without_fallback(
    timeline: dict[str, Any],
    fps: float,
) -> list[CompletenessIssue]:
    issues: list[CompletenessIssue] = []
    events = _visual_events(timeline, fps)

    for trigger in timeline.get("triggers") or []:
        if trigger.get("status") != "suppressed":
            continue
        confidence = float(trigger.get("confidence") or 0)
        if confidence < HIGH_CONFIDENCE_SUPPRESSED:
            continue
        meta = trigger.get("metadata") or {}
        if meta.get("fallbackTier") or meta.get("fallbackComponentId"):
            continue

        start = float(trigger.get("transcriptStart") or 0)
        end = float(trigger.get("transcriptEnd") or start + 1)
        has_nearby = any(
            abs((ev_start + ev_end) / 2 - (start + end) / 2) <= NEARBY_FALLBACK_SECONDS
            for ev_start, ev_end in events
        )
        if has_nearby:
            continue

        issues.append(
            CompletenessIssue(
                id=f"suppressed-{trigger.get('id')}",
                kind="suppressed_no_fallback",
                message=(
                    f"High-confidence trigger '{trigger.get('type')}' was suppressed "
                    f"with no nearby fallback visual"
                ),
                start_seconds=start,
                end_seconds=end,
                auto_resolvable=False,
            )
        )
    return issues


def _find_shallow_style(timeline: dict[str, Any]) -> list[CompletenessIssue]:
    theme = timeline.get("theme") or {}
    meta = theme.get("meta") or {}
    if meta.get("styleDepthOk") is not False:
        return []

    missing = meta.get("styleDepthMissing") or []
    if not missing:
        return []

    return [
        CompletenessIssue(
            id="style-shallow",
            kind="style_shallow",
            message=f"Style application incomplete — missing: {', '.join(missing)}",
            start_seconds=0.0,
            end_seconds=0.0,
            auto_resolvable=False,
        )
    ]


def _insert_static_stretch_fix(
    timeline: dict[str, Any],
    issue: CompletenessIssue,
    fps: float,
) -> bool:
    """Prefer Ken Burns on the primary video clip; fall back to Topic Title Card."""
    if _insert_ken_burns_on_video(timeline, issue, fps):
        issue.resolution = "ken_burns_applied"
        return True
    return _insert_topic_title_card(timeline, issue, fps)


def _insert_ken_burns_on_video(
    timeline: dict[str, Any],
    issue: CompletenessIssue,
    fps: float,
) -> bool:
    start_frame = int(issue.start_seconds * fps)
    end_frame = int(issue.end_seconds * fps)
    video_clips = list((timeline.get("tracks") or {}).get("video") or [])
    if not video_clips:
        return False

    for clip in video_clips:
        cs = int(clip.get("startFrame") or 0)
        ce = cs + int(clip.get("durationInFrames") or 0)
        if cs <= start_frame and ce >= end_frame:
            seed = abs(hash(str(clip.get("id", issue.id)))) % 10000
            clip["cameraMotion"] = {
                "type": "ken_burns",
                "seed": seed,
                "intensity": 0.32,
                "direction": "center_out",
            }
            triggers = list(timeline.get("triggers") or [])
            triggers.append(
                {
                    "id": f"readiness-kb-{issue.id}",
                    "type": "readiness_fix",
                    "transcriptStart": issue.start_seconds,
                    "transcriptEnd": issue.end_seconds,
                    "confidence": 1.0,
                    "status": "realized",
                    "resultingEntryId": clip.get("id"),
                    "metadata": {
                        "fallbackTier": "readiness_ken_burns",
                        "source": "export_readiness",
                    },
                }
            )
            timeline["triggers"] = triggers
            return True
    return False


def _insert_topic_title_card(
    timeline: dict[str, Any],
    issue: CompletenessIssue,
    fps: float,
) -> bool:
    mid = (issue.start_seconds + issue.end_seconds) / 2
    start_frame = int(mid * fps)
    duration_frames = min(int(4 * fps), int((issue.end_seconds - issue.start_seconds) * fps * 0.25))
    duration_frames = max(duration_frames, int(2 * fps))

    mg_id = f"readiness-fix-{issue.id}"
    entry = {
        "id": mg_id,
        "componentId": "topic_title_card",
        "startFrame": start_frame,
        "durationInFrames": duration_frames,
        "layerDepth": 18,
        "props": {"label": "Segment", "subtitle": "Auto-added for visual variety"},
        "triggerId": f"readiness-{issue.id}",
    }

    tracks = timeline.setdefault("tracks", {})
    mg = list(tracks.get("motionGraphics") or [])
    mg.append(entry)
    tracks["motionGraphics"] = mg

    triggers = list(timeline.get("triggers") or [])
    triggers.append(
        {
            "id": f"readiness-{issue.id}",
            "type": "readiness_fix",
            "transcriptStart": issue.start_seconds,
            "transcriptEnd": issue.start_seconds + duration_frames / fps,
            "confidence": 1.0,
            "status": "realized",
            "resultingEntryId": mg_id,
            "metadata": {"fallbackTier": "readiness_auto_fix", "source": "export_readiness"},
        }
    )
    timeline["triggers"] = triggers
    issue.resolution = "topic_title_card_inserted"
    return True


def _insert_fallback_near_suppressed(
    timeline: dict[str, Any],
    issue: CompletenessIssue,
    fps: float,
) -> bool:
    """Insert a nearby MG fallback for a high-confidence suppressed trigger."""
    trigger_id = issue.id.removeprefix("suppressed-")
    trigger = next(
        (t for t in timeline.get("triggers") or [] if str(t.get("id")) == trigger_id),
        None,
    )
    trigger_type = str(trigger.get("type") if trigger else "topic_shift")
    component_id = (
        "pull_quote_card"
        if trigger_type == "high_emphasis_moment"
        else "topic_title_card"
    )
    start_frame = int(issue.start_seconds * fps)
    duration_frames = max(int(3 * fps), int((issue.end_seconds - issue.start_seconds) * fps))
    mg_id = f"readiness-suppressed-{trigger_id}"

    entry = {
        "id": mg_id,
        "componentId": component_id,
        "startFrame": start_frame,
        "durationInFrames": duration_frames,
        "layerDepth": 62 if component_id == "pull_quote_card" else 18,
        "props": {
            "label": "Key moment",
            "text": "Key moment",
        },
        "triggerId": trigger_id,
    }
    tracks = timeline.setdefault("tracks", {})
    mg = list(tracks.get("motionGraphics") or [])
    mg.append(entry)
    tracks["motionGraphics"] = mg

    if trigger:
        meta = dict(trigger.get("metadata") or {})
        meta["fallbackTier"] = "readiness_suppressed_nearby"
        meta["fallbackComponentId"] = component_id
        trigger["metadata"] = meta

    issue.resolved = True
    issue.resolution = f"{component_id}_near_suppressed"
    return True


def _issue_to_checklist_line(issue: CompletenessIssue) -> str:
    if issue.kind == "static_stretch":
        return (
            f"Segment {issue.start_seconds:.0f}s–{issue.end_seconds:.0f}s has no visual variety "
            f"for {issue.end_seconds - issue.start_seconds:.0f}+ seconds — "
            "add B-roll or a title card?"
        )
    return issue.message
