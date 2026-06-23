"""
Edit Recipe — a normalized timeline of edits extracted from a reference video.

Unlike StyleDNA (global averages), an EditRecipe captures WHEN each edit happens
(0–100% through the reference) so we can scale and apply the full edit pattern once
onto any target video (3 min, 20 min, shorts, etc.).

Content policy on each event:
  user_captions  — apply styling only; keep the user's Nepali/English caption text
  placeholder    — logo, graphic, b-roll slot (no copied reference text)
  style_only     — transitions, color, zoom (no text)
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from .models import HookProfile, StyleDNA, TransitionProfile

if False:  # TYPE_CHECKING
    from .vision_analyzer import VisionAnalysisResult


@dataclass
class EditRecipeEvent:
    """One detected edit at a normalized position in the reference video."""
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    kind: str = "cut"
    start_pct: float = 0.0
    end_pct: float = 0.0
    label: str = ""
    params: dict[str, Any] = field(default_factory=dict)
    content_policy: str = "style_only"

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "start_pct": round(self.start_pct, 4),
            "end_pct": round(self.end_pct, 4),
            "label": self.label,
            "params": self.params,
            "content_policy": self.content_policy,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "EditRecipeEvent":
        return cls(
            id=str(d.get("id", str(uuid.uuid4())[:8])),
            kind=str(d.get("kind", "cut")),
            start_pct=float(d.get("start_pct", 0.0)),
            end_pct=float(d.get("end_pct", d.get("start_pct", 0.0))),
            label=str(d.get("label", "")),
            params=dict(d.get("params") or {}),
            content_policy=str(d.get("content_policy", "style_only")),
        )


@dataclass
class EditRecipe:
    """
    Full edit pattern from a reference video, normalized to 0–1 timeline.
    Stored on StylePreset.edit_recipe and applied once to the target project.
    """
    reference_duration_s: float = 0.0
    events: list[EditRecipeEvent] = field(default_factory=list)
    version: int = 1

    def to_dict(self) -> dict[str, Any]:
        return {
            "reference_duration_s": round(self.reference_duration_s, 3),
            "version": self.version,
            "events": [e.to_dict() for e in self.events],
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any] | None) -> "EditRecipe | None":
        if not d or not isinstance(d, dict):
            return None
        events_raw = d.get("events", [])
        events = [
            EditRecipeEvent.from_dict(e)
            for e in events_raw
            if isinstance(e, dict)
        ]
        return cls(
            reference_duration_s=float(d.get("reference_duration_s", 0.0)),
            events=events,
            version=int(d.get("version", 1)),
        )

    def event_counts(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for e in self.events:
            counts[e.kind] = counts.get(e.kind, 0) + 1
        return counts


def _pct(time_ms: float, total_ms: float) -> float:
    if total_ms <= 0:
        return 0.0
    return max(0.0, min(1.0, time_ms / total_ms))


def _transition_kind(trans: TransitionProfile) -> str:
    t = trans.primary_type or "cut"
    if t in ("cut", ""):
        return "hard_cut"
    return f"transition_{t}"


def _vision_edit_to_event(edit: Any, total_ms: float) -> EditRecipeEvent:
    """Convert a vision DetectedEdit into a normalized recipe event."""
    start_ms = float(getattr(edit, "start_ms", 0))
    end_ms = float(getattr(edit, "end_ms", start_ms))
    kind = str(getattr(edit, "kind", "graphic"))
    params = dict(getattr(edit, "params", {}) or {})
    if kind.startswith("transition_") or kind == "hard_cut":
        params.setdefault("transition_type", kind.replace("transition_", "").replace("hard_cut", "cut"))
    return EditRecipeEvent(
        kind=kind,
        start_pct=_pct(start_ms, total_ms),
        end_pct=_pct(max(end_ms, start_ms + 100), total_ms),
        label=str(getattr(edit, "label", "")),
        params=params,
        content_policy=str(getattr(edit, "content_policy", "style_only")),
    )


def build_edit_recipe(
    dna: StyleDNA,
    scenes: list[dict],
    reference_duration_s: float,
    vision: "VisionAnalysisResult | None" = None,
) -> EditRecipe:
    """
    Build a normalized edit recipe from scene cuts + StyleDNA profiles.

    Detects: cuts/transitions, hook, caption style regions, color grade,
    text/graphic/logo/b-roll placeholders at motivated positions.
    """
    total_ms = max(
        reference_duration_s * 1000.0,
        max((s.get("end_ms", 0) for s in scenes), default=0),
    )
    events: list[EditRecipeEvent] = []

    # ── Global styles (applied once on target, stored at t=0) ───────────────
    events.append(EditRecipeEvent(
        kind="color_grade",
        start_pct=0.0,
        end_pct=1.0,
        label="Color grade",
        params={
            "brightness": dna.color.brightness,
            "contrast": dna.color.contrast,
            "saturation": dna.color.saturation,
            "temperature": dna.color.temperature,
            "shadows": dna.color.shadows,
            "highlights": dna.color.highlights,
        },
        content_policy="style_only",
    ))

    cap_params = {
        "position": dna.captions.position,
        "color": dna.captions.color,
        "stroke": dna.captions.stroke,
        "stroke_width": dna.captions.stroke_width,
        "animation": dna.captions.animation,
        "max_words_per_line": dna.captions.max_words_per_line,
        "case": dna.captions.case,
        "highlight_color": dna.captions.highlight_color,
        "background_opacity": dna.captions.background_opacity,
        "font_size_vw": dna.captions.font_size_vw,
    }
    if vision and vision.caption_hints:
        cap_params.update({k: v for k, v in vision.caption_hints.items() if v is not None})

    events.append(EditRecipeEvent(
        kind="caption_style",
        start_pct=0.0,
        end_pct=1.0,
        label="Caption styling",
        params=cap_params,
        content_policy="user_captions",
    ))

    # ── Hook (opening ~first 8% or hook_duration, once at start) ────────────
    hook = dna.hook
    hook_end_pct = min(0.12, hook.hook_duration_s / max(reference_duration_s, 1.0))
    if hook.uses_text_hook_overlay or hook.hook_type:
        events.append(EditRecipeEvent(
            kind="hook",
            start_pct=0.0,
            end_pct=max(0.03, hook_end_pct),
            label=f"Hook ({hook.hook_type.replace('_', ' ')})",
            params={
                "hook_type": hook.hook_type,
                "suggested_visual": "text_overlay",
                "visual_type": "hook_rewrite",
            },
            content_policy="placeholder",
        ))

    # ── Per-cut transitions from scene boundaries ───────────────────────────
    trans_type = dna.transitions.primary_type or "cut"
    trans_dur_ms = dna.transitions.avg_duration_ms
    for i, scene in enumerate(scenes):
        if i == 0:
            continue
        cut_ms = float(scene.get("start_ms", 0))
        pct = _pct(cut_ms, total_ms)
        dur_ms = float(scene.get("duration_ms", 3000))
        kind = _transition_kind(dna.transitions)
        if trans_type != "cut" and trans_dur_ms > 0:
            kind = f"transition_{trans_type}"

        events.append(EditRecipeEvent(
            kind=kind,
            start_pct=pct,
            end_pct=pct,
            label=f"Cut {i}" if trans_type == "cut" else f"{trans_type.title()} transition",
            params={
                "transition_type": trans_type,
                "duration_ms": trans_dur_ms,
                "scene_duration_ms": dur_ms,
            },
            content_policy="style_only",
        ))

        # Short scenes → likely b-roll / insert
        if dur_ms < 2500 and dna.broll.frequency in ("medium", "high", "low"):
            mid_ms = cut_ms + dur_ms / 2.0
            events.append(EditRecipeEvent(
                kind="broll",
                start_pct=_pct(cut_ms, total_ms),
                end_pct=_pct(cut_ms + dur_ms, total_ms),
                label="B-roll slot",
                params={
                    "visual_type": "broll_insert",
                    "suggested_visual": "broll_placeholder",
                    "duration_ms": dur_ms,
                },
                content_policy="placeholder",
            ))

    # ── Visual overlays (text / graphics) at scene midpoints ────────────────
    if dna.visuals.uses_text_overlays:
        step = max(1, len(scenes) // max(1, {"sparse": 4, "moderate": 2, "dense": 1}.get(
            dna.visuals.overlay_density, 2,
        )))
        for i, scene in enumerate(scenes):
            if i % step != 0 and i != 0:
                continue
            start_ms = float(scene.get("start_ms", 0))
            dur_ms = float(scene.get("duration_ms", 2000))
            if dur_ms < 800:
                continue
            end_ms = start_ms + min(dur_ms, 3500)
            vtype = {
                "minimal": "key_term",
                "bold": "statistic",
                "neon": "large_number",
                "corporate": "cta",
            }.get(dna.visuals.text_style, "key_term")
            events.append(EditRecipeEvent(
                kind="graphic",
                start_pct=_pct(start_ms, total_ms),
                end_pct=_pct(end_ms, total_ms),
                label="Graphic slot",
                params={
                    "visual_type": vtype,
                    "suggested_visual": "animated_graphic",
                    "text_style": dna.visuals.text_style,
                },
                content_policy="placeholder",
            ))

    if dna.visuals.uses_arrows_circles:
        events.append(EditRecipeEvent(
            kind="graphic",
            start_pct=0.08,
            end_pct=0.14,
            label="Callout / arrow",
            params={"visual_type": "callout", "suggested_visual": "arrow_circle"},
            content_policy="placeholder",
        ))

    # Logo placeholder at start if dense overlays (common creator pattern)
    if dna.visuals.overlay_density == "dense" or dna.visuals.text_style == "corporate":
        events.append(EditRecipeEvent(
            kind="logo",
            start_pct=0.0,
            end_pct=min(0.06, 3.0 / max(reference_duration_s, 1.0)),
            label="Logo slot",
            params={"visual_type": "logo", "suggested_visual": "logo_placeholder"},
            content_policy="placeholder",
        ))

    # Zoom / ken burns on longer scenes (heuristic)
    if dna.transitions.primary_type == "zoom" or dna.pacing.cuts_per_minute < 15:
        for scene in scenes[:6]:
            dur_ms = float(scene.get("duration_ms", 0))
            if dur_ms < 4000:
                continue
            start_ms = float(scene.get("start_ms", 0))
            events.append(EditRecipeEvent(
                kind="zoom",
                start_pct=_pct(start_ms, total_ms),
                end_pct=_pct(start_ms + min(dur_ms, 5000), total_ms),
                label="Zoom / push-in",
                params={"effect": "ken_burns", "scale_end": 1.08},
                content_policy="style_only",
            ))
            break

    # ── Vision-detected edits (replace weaker heuristics when present) ───────
    if vision and vision.detected_edits:
        vision_kinds = {
            "split_screen", "picture_in_picture", "logo", "zoom", "digital_zoom",
            "hook", "graphic", "lower_third", "broll", "cta", "sfx",
            "music_bed", "jump_cut_pacing",
        }
        transition_kinds = {e.kind for e in vision.detected_edits if e.kind.startswith("transition") or e.kind == "hard_cut"}

        events = [
            e for e in events
            if e.kind not in vision_kinds
            and not (
                (e.kind.startswith("transition") or e.kind == "hard_cut")
                and transition_kinds
            )
        ]
        if not any(e.kind == "hook" for e in vision.detected_edits):
            pass  # keep heuristic hook
        else:
            events = [e for e in events if e.kind != "hook"]

        for vedit in vision.detected_edits:
            events.append(_vision_edit_to_event(vedit, total_ms))

        if vision.transition_primary and vision.transition_primary != "cut":
            dna.transitions.primary_type = vision.transition_primary

    # Sort by start position
    events.sort(key=lambda e: (e.start_pct, e.end_pct))

    recipe = EditRecipe(
        reference_duration_s=reference_duration_s,
        events=events,
    )
    if vision:
        recipe.version = 2
    return recipe
