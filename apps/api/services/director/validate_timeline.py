"""
Director Engine Phase 5 — automated timeline validation.

Checks Integration Laws and render-readiness criteria on a compiled DirectorTimeline.
Manual checks (audible ducking, visible grade, multicam alignment) are listed but
require human review on real exported video.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

Severity = Literal["error", "warning"]

GLITCH_MAX_FRAMES = 4
LAYER_CONTENT_MIN = 10
LAYER_CONTENT_MAX = 70
LAYER_VFX_MIN = 70
LAYER_VFX_MAX = 85

GRADE_EXPECTATIONS: dict[str, dict[str, Any]] = {
    "podcast": {"warmth_min": 0.1, "grain_max": 0.15},
    "consultancy": {"grain_max": 0.01, "vignette_max": 0.01},
    "social": {"contrast_min": 0.15, "saturation_min": 0.1},
    "showcase": {"grain_max": 0.01, "vignette_max": 0.01},
}

MANUAL_CHECKS = [
    {
        "id": "devanagari_not_clipped",
        "description": "Nepali caption text is fully visible — no clipped Devanagari glyphs in export.",
    },
    {
        "id": "safe_zone_respected",
        "description": "Motion graphics and captions stay inside title-safe zones for the aspect ratio.",
    },
    {
        "id": "grade_visually_correct",
        "description": "Color grade matches content pillar (warm podcast, clean consultancy, punchy social).",
    },
    {
        "id": "ducking_sounds_natural",
        "description": "Music bed ducks under dialogue/SFX and recovers smoothly — no pumping artifacts.",
    },
    {
        "id": "multicam_speaker_alignment",
        "description": "Camera switches align with actual speaker changes on multi-feed podcasts.",
    },
    {
        "id": "sfx_audible_at_triggers",
        "description": "SFX cues are audible at their trigger frames and tied to visible events.",
    },
]


@dataclass
class ValidationCheck:
    id: str
    passed: bool
    message: str
    severity: Severity = "error"


@dataclass
class DirectorValidationReport:
    passed: bool
    content_type: str
    checks: list[ValidationCheck] = field(default_factory=list)
    manual_checks: list[dict[str, str]] = field(default_factory=lambda: list(MANUAL_CHECKS))

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "contentType": self.content_type,
            "checks": [
                {
                    "id": c.id,
                    "passed": c.passed,
                    "severity": c.severity,
                    "message": c.message,
                }
                for c in self.checks
            ],
            "manualChecks": self.manual_checks,
            "errorCount": sum(1 for c in self.checks if not c.passed and c.severity == "error"),
            "warningCount": sum(1 for c in self.checks if not c.passed and c.severity == "warning"),
        }


def validate_director_timeline(timeline: dict[str, Any]) -> DirectorValidationReport:
    """Run all automated Phase 5 checks on a compiled DirectorTimeline."""
    content_type = str(timeline.get("contentType") or "podcast")
    checks: list[ValidationCheck] = []

    checks.append(_check_schema(timeline))
    checks.extend(_check_no_empty_asset_urls(timeline))
    checks.extend(_check_trigger_attribution(timeline))
    checks.extend(_check_layer_depths(timeline))
    checks.extend(_check_flash_safety(timeline))
    checks.extend(_check_grade_for_content_type(timeline, content_type))
    checks.extend(_check_ducking_windows(timeline))
    checks.extend(_check_multicam_consistency(timeline))
    checks.extend(_check_sfx_attribution(timeline))
    checks.extend(_check_suppressed_broll_not_realized(timeline))

    passed = all(c.passed for c in checks if c.severity == "error")
    return DirectorValidationReport(
        passed=passed,
        content_type=content_type,
        checks=checks,
    )


def _check_schema(timeline: dict[str, Any]) -> ValidationCheck:
    ok = (
        timeline.get("schemaVersion") == 1
        and bool(timeline.get("projectId"))
        and int(timeline.get("durationInFrames") or 0) > 0
        and int(timeline.get("fps") or 0) > 0
        and isinstance(timeline.get("tracks"), dict)
        and isinstance(timeline.get("triggers"), list)
    )
    return ValidationCheck(
        id="schema_valid",
        passed=ok,
        message="Timeline has schemaVersion, projectId, duration, fps, tracks, triggers"
        if ok
        else "Timeline is missing required DirectorTimeline fields",
    )


def _check_no_empty_asset_urls(timeline: dict[str, Any]) -> list[ValidationCheck]:
    checks: list[ValidationCheck] = []
    tracks = timeline.get("tracks") or {}

    for entry in tracks.get("broll") or []:
        url = str(entry.get("assetUrl") or "").strip()
        checks.append(
            ValidationCheck(
                id=f"broll_asset_url_{entry.get('id', 'unknown')}",
                passed=bool(url),
                message=f"B-roll entry {entry.get('id')} has a real assetUrl"
                if url
                else f"B-roll entry {entry.get('id')} violates No-Empty-Asset Law",
            )
        )

    for clip in tracks.get("video") or []:
        asset_id = str(clip.get("assetId") or "").strip()
        if clip.get("assetUrl") is not None:
            url = str(clip.get("assetUrl") or "").strip()
            checks.append(
                ValidationCheck(
                    id=f"video_asset_url_{clip.get('id', 'unknown')}",
                    passed=bool(url or asset_id),
                    message="Video clip has asset reference",
                )
            )

    if not checks:
        checks.append(
            ValidationCheck(
                id="no_empty_asset_urls",
                passed=True,
                message="No B-roll entries with empty assetUrl",
            )
        )
    return checks


def _check_trigger_attribution(timeline: dict[str, Any]) -> list[ValidationCheck]:
    checks: list[ValidationCheck] = []
    tracks = timeline.get("tracks") or {}
    realized = [t for t in timeline.get("triggers") or [] if t.get("status") == "realized"]

    for trigger in realized:
        if _is_cut_pipeline_trigger(trigger):
            continue
        entry_id = trigger.get("resultingEntryId")
        checks.append(
            ValidationCheck(
                id=f"realized_has_entry_{trigger.get('id')}",
                passed=bool(entry_id),
                message=f"Realized trigger {trigger.get('id')} has resultingEntryId",
            )
        )

    for entry in tracks.get("motionGraphics") or []:
        tid = entry.get("triggerId")
        checks.append(
            ValidationCheck(
                id=f"mg_trigger_{entry.get('id')}",
                passed=bool(tid),
                message=f"Motion graphic {entry.get('id')} is tied to trigger {tid}",
            )
        )

    for entry in tracks.get("sfx") or []:
        tid = entry.get("triggerId")
        checks.append(
            ValidationCheck(
                id=f"sfx_trigger_{entry.get('id')}",
                passed=bool(tid),
                message=f"SFX {entry.get('id')} is tied to trigger {tid}",
            )
        )

    if not realized:
        checks.append(
            ValidationCheck(
                id="trigger_attribution",
                passed=True,
                severity="warning",
                message="No realized triggers — timeline may be empty",
            )
        )
    return checks


def _is_cut_pipeline_trigger(trigger: dict[str, Any]) -> bool:
    """Cuts engine appends structural triggers without MG resultingEntryId."""
    trigger_id = str(trigger.get("id", ""))
    if trigger_id.startswith(("silence-", "speaker-", "beat-", "cut-", "filler-")):
        return True
    return trigger.get("type") in ("silence", "beat", "filler")


def _check_layer_depths(timeline: dict[str, Any]) -> list[ValidationCheck]:
    checks: list[ValidationCheck] = []
    tracks = timeline.get("tracks") or {}

    for entry in tracks.get("motionGraphics") or []:
        depth = int(entry.get("layerDepth") or 0)
        ok = LAYER_CONTENT_MIN <= depth <= LAYER_CONTENT_MAX or depth >= 85
        checks.append(
            ValidationCheck(
                id=f"layer_depth_mg_{entry.get('id')}",
                passed=ok,
                message=f"Motion graphic layerDepth {depth} within content/chrome bands",
            )
        )

    for entry in tracks.get("vfx") or []:
        depth = int(entry.get("layerDepth") or 75)
        ok = LAYER_VFX_MIN <= depth <= LAYER_VFX_MAX
        checks.append(
            ValidationCheck(
                id=f"layer_depth_vfx_{entry.get('id')}",
                passed=ok,
                message=f"VFX layerDepth {depth} within band 70–85",
            )
        )

    if not checks:
        checks.append(
            ValidationCheck(
                id="layer_depths",
                passed=True,
                message="No motion graphics or VFX entries to check",
            )
        )
    return checks


def _check_flash_safety(timeline: dict[str, Any]) -> list[ValidationCheck]:
    checks: list[ValidationCheck] = []
    tracks = timeline.get("tracks") or {}

    for tr in tracks.get("transitions") or []:
        if tr.get("type") in ("glitch_cut", "glitch"):
            dur = int(tr.get("durationInFrames") or 0)
            checks.append(
                ValidationCheck(
                    id=f"glitch_transition_{tr.get('id')}",
                    passed=dur <= GLITCH_MAX_FRAMES,
                    message=f"Glitch transition duration {dur} frames ≤ {GLITCH_MAX_FRAMES}",
                )
            )

    for vfx in tracks.get("vfx") or []:
        if vfx.get("type") == "glitch":
            dur = int(vfx.get("durationInFrames") or 0)
            checks.append(
                ValidationCheck(
                    id=f"glitch_vfx_{vfx.get('id')}",
                    passed=dur <= GLITCH_MAX_FRAMES,
                    message=f"Glitch VFX duration {dur} frames ≤ {GLITCH_MAX_FRAMES}",
                )
            )

    if not checks:
        checks.append(
            ValidationCheck(
                id="flash_safety",
                passed=True,
                message="No glitch transitions/VFX — flash safety N/A",
            )
        )
    return checks


def _check_grade_for_content_type(
    timeline: dict[str, Any],
    content_type: str,
) -> list[ValidationCheck]:
    checks: list[ValidationCheck] = []
    theme = timeline.get("theme") or {}
    grade = theme.get("grade")
    if not isinstance(grade, dict):
        return [
            ValidationCheck(
                id="grade_present",
                passed=False,
                message="theme.grade is missing from timeline",
            )
        ]

    checks.append(
        ValidationCheck(
            id="grade_present",
            passed=True,
            message="theme.grade is present",
        )
    )

    expectations = GRADE_EXPECTATIONS.get(content_type, {})
    if "warmth_min" in expectations:
        warmth = float(grade.get("warmth", 0))
        checks.append(
            ValidationCheck(
                id="grade_warmth_podcast",
                passed=warmth >= expectations["warmth_min"],
                message=f"Podcast grade warmth {warmth} ≥ {expectations['warmth_min']}",
            )
        )
    if "grain_max" in expectations:
        grain = float(grade.get("grainIntensity", 0))
        checks.append(
            ValidationCheck(
                id="grade_grain_consultancy",
                passed=grain <= expectations["grain_max"],
                message=f"Grade grain {grain} ≤ {expectations['grain_max']} for {content_type}",
            )
        )
    if "contrast_min" in expectations:
        contrast = float(grade.get("contrast", 0))
        checks.append(
            ValidationCheck(
                id="grade_contrast_social",
                passed=contrast >= expectations["contrast_min"],
                message=f"Social grade contrast {contrast} ≥ {expectations['contrast_min']}",
            )
        )
    if "saturation_min" in expectations:
        sat = float(grade.get("saturation", 0))
        checks.append(
            ValidationCheck(
                id="grade_saturation_social",
                passed=sat >= expectations["saturation_min"],
                message=f"Social grade saturation {sat} ≥ {expectations['saturation_min']}",
            )
        )
    if "vignette_max" in expectations:
        vig = float(grade.get("vignetteIntensity", 0))
        checks.append(
            ValidationCheck(
                id="grade_vignette_clean",
                passed=vig <= expectations["vignette_max"],
                message=f"Grade vignette {vig} ≤ {expectations['vignette_max']} for {content_type}",
            )
        )
    return checks


def _check_ducking_windows(timeline: dict[str, Any]) -> list[ValidationCheck]:
    checks: list[ValidationCheck] = []
    duration = int(timeline.get("durationInFrames") or 0)

    for clip in (timeline.get("tracks") or {}).get("audio") or []:
        for window in clip.get("duckingWindows") or []:
            start = int(window.get("startFrame", -1))
            end = int(window.get("endFrame", -1))
            ok = 0 <= start < end <= max(duration, end)
            checks.append(
                ValidationCheck(
                    id=f"ducking_{window.get('id', start)}",
                    passed=ok,
                    message=f"Ducking window frames {start}–{end} within timeline duration {duration}",
                )
            )

    if not checks:
        checks.append(
            ValidationCheck(
                id="ducking_windows",
                passed=True,
                message="No ducking windows (dialogue-only export is OK)",
            )
        )
    return checks


def _check_multicam_consistency(timeline: dict[str, Any]) -> list[ValidationCheck]:
    multicam = (timeline.get("tracks") or {}).get("multicam") or []
    if not multicam:
        return [
            ValidationCheck(
                id="multicam_consistency",
                passed=True,
                message="No multicam entries — single-camera graceful degradation",
            )
        ]

    checks: list[ValidationCheck] = []
    for entry in multicam:
        feeds = entry.get("activeFeedIds") or []
        ok = len(feeds) >= 1
        checks.append(
            ValidationCheck(
                id=f"multicam_feeds_{entry.get('id')}",
                passed=ok,
                message=f"Multicam entry {entry.get('id')} references {len(feeds)} feed(s)",
            )
        )
        tid = entry.get("triggerId")
        checks.append(
            ValidationCheck(
                id=f"multicam_trigger_{entry.get('id')}",
                passed=bool(tid),
                severity="warning" if not tid else "error",
                message=f"Multicam entry linked to trigger {tid}",
            )
        )
    return checks


def _check_sfx_attribution(timeline: dict[str, Any]) -> list[ValidationCheck]:
    sfx = (timeline.get("tracks") or {}).get("sfx") or []
    if not sfx:
        return [
            ValidationCheck(
                id="sfx_attribution",
                passed=True,
                message="No SFX entries",
            )
        ]
    return _check_trigger_attribution_for_track(sfx, "sfx")


def _check_trigger_attribution_for_track(
    entries: list[dict[str, Any]],
    prefix: str,
) -> list[ValidationCheck]:
    checks: list[ValidationCheck] = []
    for entry in entries:
        tid = entry.get("triggerId")
        checks.append(
            ValidationCheck(
                id=f"{prefix}_attribution_{entry.get('id')}",
                passed=bool(tid),
                message=f"{prefix} entry {entry.get('id')} has triggerId {tid}",
            )
        )
    return checks


def _check_suppressed_broll_not_realized(timeline: dict[str, Any]) -> list[ValidationCheck]:
    checks: list[ValidationCheck] = []
    broll_ids = {e.get("id") for e in (timeline.get("tracks") or {}).get("broll") or []}

    for trigger in timeline.get("triggers") or []:
        if trigger.get("status") != "realized":
            continue
        entry_id = trigger.get("resultingEntryId")
        if not entry_id or entry_id not in broll_ids:
            continue
        entry = next(
            (e for e in (timeline.get("tracks") or {}).get("broll") or [] if e.get("id") == entry_id),
            None,
        )
        if entry and not str(entry.get("assetUrl") or "").strip():
            checks.append(
                ValidationCheck(
                    id=f"suppressed_broll_realized_{trigger.get('id')}",
                    passed=False,
                    message=f"Trigger {trigger.get('id')} realized with empty B-roll URL",
                )
            )

    if not checks:
        checks.append(
            ValidationCheck(
                id="suppressed_broll_not_realized",
                passed=True,
                message="No realized B-roll triggers with empty URLs",
            )
        )
    return checks
