"""
Podcast / talking-head Shorts edit profile.

Detects the high-energy micro-content pattern:
  • Aggressive jump cuts
  • Digital zoom punches on emphasis
  • Screen-recording B-roll cutaways
  • Center pop captions with keyword highlights
  • Title hook banner + end CTA
  • SFX on cuts + background music bed
"""
from __future__ import annotations

import statistics
from typing import Any

from .vision_analyzer import DetectedEdit, VisionAnalysisResult


def _ui_score(frame: Any) -> float:
    """Higher = more likely screen recording / UI content."""
    import cv2
    import numpy as np

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    center = gray[h // 4: 3 * h // 4, w // 4: 3 * w // 4]
    edges = cv2.Canny(center, 80, 160)
    edge_density = float(np.mean(edges)) / 255.0
    # UI frames: many bright rectangles
    bright = float(np.mean(center > 200))
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 40, minLineLength=w // 6, maxLineGap=10)
    line_count = len(lines) if lines is not None else 0
    line_score = min(1.0, line_count / 12.0)
    return edge_density * 0.4 + bright * 0.35 + line_score * 0.25


def _talking_head_score(frame: Any) -> float:
    """Higher = likely speaker A-roll (face / desk)."""
    import cv2
    import numpy as np

    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    h, w = hsv.shape[:2]
    center = hsv[h // 5: 4 * h // 5, w // 5: 4 * w // 5]
    hue = center[:, :, 0]
    sat = center[:, :, 1]
    val = center[:, :, 2]
    # Skin-ish hues in OpenCV H (0–180)
    skin_mask = ((hue < 25) | (hue > 160)) & (sat > 30) & (val > 50)
    skin_ratio = float(np.sum(skin_mask)) / max(skin_mask.size, 1)
    vignette = float(np.mean(val)) / 255.0
    return skin_ratio * 0.7 + vignette * 0.3


def classify_shorts_archetype(
    scenes: list[dict],
    total_ms: float,
    vision: VisionAnalysisResult,
) -> str:
    if not scenes or total_ms <= 0:
        return "generic"
    durations = [float(s.get("duration_ms", 3000)) for s in scenes]
    cuts_pm = len(scenes) / (total_ms / 60_000.0)
    avg_dur = statistics.mean(durations)
    broll_kinds = sum(1 for e in vision.detected_edits if e.kind == "broll")
    if cuts_pm >= 18 and avg_dur <= 4000:
        return "podcast_short"
    if cuts_pm >= 12 and (broll_kinds >= 2 or vision.hook_uses_text):
        return "talking_head_short"
    return "generic"


def enrich_for_podcast_shorts(
    vision: VisionAnalysisResult,
    scenes: list[dict],
    frames: list[tuple[float, Any]],
    total_ms: float,
    fps: float,
) -> VisionAnalysisResult:
    """Add Shorts-specific edits when archetype matches."""
    archetype = classify_shorts_archetype(scenes, total_ms, vision)
    if archetype not in ("podcast_short", "talking_head_short"):
        return vision

    vision.caption_hints = {
        "position": "center",
        "animation": "word-by-word",
        "case": "uppercase",
        "color": "#FFFFFF",
        "stroke": "#000000",
        "stroke_width": 4,
        "highlight_color": "#FFD700",
        "background_opacity": 0.55,
        "font_size_vw": 6.5,
        "max_words_per_line": 2,
    }
    vision.transition_primary = "cut"
    vision.hook_uses_text = True
    vision.overlay_density = "moderate"

    existing_kinds = {e.kind for e in vision.detected_edits}

    # ── Screen B-roll from UI-heavy scenes ───────────────────────────────────
    for scene in scenes:
        start_ms = float(scene.get("start_ms", 0))
        end_ms = float(scene.get("end_ms", start_ms))
        dur = end_ms - start_ms
        if dur < 800 or dur > 12000:
            continue
        mid = start_ms + dur / 2.0
        frame = _nearest_frame(frames, mid)
        if frame is None:
            continue
        if _ui_score(frame) > _talking_head_score(frame) + 0.08:
            vision.detected_edits.append(DetectedEdit(
                kind="broll",
                start_ms=start_ms,
                end_ms=end_ms,
                label="Screen recording B-roll",
                params={
                    "visual_type": "screen_recording",
                    "broll_type": "screen_recording",
                    "suggested_visual": "broll_cutaway",
                    "overlay_mode": "fullscreen",
                    "slot_label": "Your screen recording / demo",
                },
                confidence=0.78,
                content_policy="placeholder",
            ))

    # ── Digital zoom punches at scene boundaries (emphasis) ────────────────
    for i, scene in enumerate(scenes):
        if i == 0:
            continue
        cut_ms = float(scene.get("start_ms", 0))
        prev = scenes[i - 1]
        prev_end = float(prev.get("end_ms", cut_ms))
        f_before = _nearest_frame(frames, max(0, prev_end - 100))
        f_after = _nearest_frame(frames, cut_ms + 50)
        punch = 0.0
        if f_before is not None and f_after is not None:
            punch = _detect_zoom_punch(f_before, f_after)
        # Fast-cut Shorts: periodic punch-ins even when frame diff is subtle
        if punch <= 0.06 and archetype == "podcast_short" and i % 3 == 0:
            punch = 0.08
        if punch > 0.06:
            vision.detected_edits.append(DetectedEdit(
                kind="digital_zoom",
                start_ms=cut_ms,
                end_ms=cut_ms + min(450, float(scene.get("duration_ms", 2000)) * 0.3),
                label="Digital zoom punch",
                params={
                    "effect": "digital_zoom_punch",
                    "scale_end": round(1.0 + min(0.18, punch * 1.5), 3),
                    "duration_ms": 350,
                },
                confidence=0.72,
                content_policy="style_only",
            ))

    # ── Title hook banner (first ~3s) ──────────────────────────────────────
    if "hook" not in existing_kinds:
        hook_end = min(3500.0, total_ms * 0.12)
        vision.detected_edits.append(DetectedEdit(
            kind="hook",
            start_ms=0.0,
            end_ms=hook_end,
            label="Title hook banner",
            params={
                "visual_type": "title_banner",
                "suggested_visual": "title_banner",
                "overlay_mode": "top_banner",
                "banner_style": "black_bar_white_text",
            },
            confidence=0.8,
            content_policy="placeholder",
        ))

    # ── CTA outro (last ~15%) ───────────────────────────────────────────────
    cta_start = total_ms * 0.85
    vision.detected_edits.append(DetectedEdit(
        kind="cta",
        start_ms=cta_start,
        end_ms=total_ms,
        label="Call to action",
        params={
            "visual_type": "cta",
            "suggested_visual": "animated_graphic",
            "overlay_mode": "bottom",
        },
        confidence=0.7,
        content_policy="placeholder",
    ))

    # ── SFX markers on hard cuts ────────────────────────────────────────────
    for scene in scenes[1:8]:
        cut_ms = float(scene.get("start_ms", 0))
        vision.detected_edits.append(DetectedEdit(
            kind="sfx",
            start_ms=cut_ms,
            end_ms=cut_ms,
            label="Whoosh on cut",
            params={"sfx_type": "whoosh", "volume": 0.35},
            confidence=0.6,
            content_policy="style_only",
        ))

    # ── Global music bed hint ─────────────────────────────────────────────────
    vision.detected_edits.append(DetectedEdit(
        kind="music_bed",
        start_ms=0.0,
        end_ms=total_ms,
        label="Background music",
        params={"music_energy": "medium", "ducking": "moderate", "genre_hint": "upbeat"},
        confidence=0.65,
        content_policy="style_only",
    ))

    # ── Jump-cut pacing profile ─────────────────────────────────────────────
    durations = [float(s.get("duration_ms", 3000)) for s in scenes]
    cuts_pm = len(scenes) / max(total_ms / 60_000.0, 0.001)
    vision.detected_edits.append(DetectedEdit(
        kind="jump_cut_pacing",
        start_ms=0.0,
        end_ms=total_ms,
        label="Aggressive jump cuts",
        params={
            "cuts_per_minute": round(cuts_pm, 1),
            "avg_cut_duration_ms": round(statistics.mean(durations), 0) if durations else 2500,
            "silence_tolerance_ms": 120,
            "remove_filler": True,
        },
        confidence=0.75,
        content_policy="style_only",
    ))

    vision.detected_edits.sort(key=lambda e: (e.start_ms, e.end_ms))
    return vision


def _nearest_frame(frames: list[tuple[float, Any]], t_ms: float) -> Any | None:
    if not frames:
        return None
    return min(frames, key=lambda x: abs(x[0] - t_ms))[1]


def _detect_zoom_punch(frame_a: Any, frame_b: Any) -> float:
    """Detect abrupt center crop / punch-in between two nearby frames."""
    import cv2
    import numpy as np

    ga = cv2.cvtColor(frame_a, cv2.COLOR_BGR2GRAY)
    gb = cv2.cvtColor(frame_b, cv2.COLOR_BGR2GRAY)
    h, w = ga.shape
    cx, cy = w // 2, h // 2
    r = min(cx, cy) // 3
    crop_a = ga[cy - r: cy + r, cx - r: cx + r]
    crop_b = gb[cy - r: cy + r, cx - r: cx + r]
    if crop_a.size == 0:
        return 0.0
    # Punch-in: center of B matches a tighter crop of A
    inner_a = ga[cy - r // 2: cy + r // 2, cx - r // 2: cx + r // 2]
    if inner_a.size == 0:
        return 0.0
    inner_a = cv2.resize(inner_a, (crop_b.shape[1], crop_b.shape[0]))
    diff = float(np.mean(cv2.absdiff(inner_a, crop_b))) / 255.0
    sharp_b = float(cv2.Laplacian(crop_b, cv2.CV_64F).var())
    sharp_a = float(cv2.Laplacian(crop_a, cv2.CV_64F).var())
    sharp_gain = (sharp_b - sharp_a) / max(sharp_a, 1.0)
    if diff < 0.12 and sharp_gain > 0.05:
        return min(0.25, sharp_gain + 0.05)
    return 0.0
