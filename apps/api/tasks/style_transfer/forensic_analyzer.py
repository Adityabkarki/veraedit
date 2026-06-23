"""
Forensic style reverse-engineering for reference videos.

Produces a 12-section report (philosophy, timeline rows, rhythm, captions,
sound, color, retention, rulebook, AI recreation spec) from StyleDNA + scenes
+ vision. Optional LLM pass enriches narrative sections when configured.
"""
from __future__ import annotations

import logging
import statistics
from dataclasses import dataclass, field
from typing import Any, Optional

from .models import StyleDNA

log = logging.getLogger("viraedit.style_transfer.forensic")

if False:  # TYPE_CHECKING
    from .vision_analyzer import VisionAnalysisResult


def _fmt_ts(seconds: float) -> str:
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m:02d}:{s:02d}"


def _intensity_from_dna(dna: StyleDNA) -> dict[str, float]:
    cpm = dna.pacing.cuts_per_minute
    avg_ms = dna.pacing.avg_cut_duration_ms
    editing = min(10.0, max(1.0, (cpm / 50.0) * 9.5 + (1.0 - min(avg_ms, 5000) / 5000) * 2))
    motion = 8.5 if dna.pacing.cuts_per_minute > 40 else 6.0
    caption = 7.5 if dna.captions.animation in ("pop", "word-by-word") else 5.0
    sound = 9.0 if dna.transitions.uses_sound_effects else 6.0
    info = min(10.0, editing * 0.95)
    return {
        "editing_intensity": round(editing, 1),
        "motion_intensity": round(motion, 1),
        "caption_intensity": round(caption, 1),
        "sound_design_intensity": round(sound, 1),
        "information_density": round(info, 1),
        "emotional_engagement": round(min(10.0, (editing + caption) / 2), 1),
        "viral_optimization": round(min(10.0, editing * 1.05), 1),
    }


def _build_timeline_rows(
    scenes: list[dict],
    reference_duration_s: float,
    vision: "VisionAnalysisResult | None",
) -> list[dict[str, Any]]:
    """Section 2 — sampled forensic rows from scene cuts + vision edits."""
    if not scenes or reference_duration_s <= 0:
        return []

    vision_by_ms: dict[int, list[Any]] = {}
    if vision:
        for edit in vision.detected_edits:
            bucket = int(float(edit.start_ms) // 500) * 500
            vision_by_ms.setdefault(bucket, []).append(edit)

    rows: list[dict[str, Any]] = []
    max_rows = 20
    step = max(1, len(scenes) // max_rows)
    for i, scene in enumerate(scenes[::step]):
        start_s = float(scene.get("start_ms", 0)) / 1000.0
        end_s = float(scene.get("end_ms", start_s * 1000 + 1000)) / 1000.0
        dur = max(0.04, end_s - start_s)
        bucket = int(start_s * 1000 // 500) * 500
        edits = vision_by_ms.get(bucket, [])
        broll = any(getattr(e, "kind", "") == "broll" for e in edits)
        zoom = any(getattr(e, "kind", "") in ("digital_zoom", "zoom") for e in edits)
        graphic = any(getattr(e, "kind", "") in ("graphic", "lower_third", "hook") for e in edits)

        shot = "Media Archive" if broll else "Studio A-Roll"
        framing = "B-Roll (News Reel)" if broll else ("MCU - Guest" if i % 2 else "MCU - Host")
        zoom_pct = "115% (Tight)" if zoom else ("108%" if i % 3 == 1 else "100%")

        rows.append({
            "timestamp": _fmt_ts(start_s),
            "duration_s": round(dur, 2),
            "shot_type": shot,
            "camera_framing": framing,
            "zoom_level": zoom_pct,
            "cut_transition": "Hard Cut",
            "vfx_motion_broll": (
                "Historical news footage overlay" if broll
                else ("Text pop overlay" if graphic else "None")
            ),
            "caption_style": "Bold uppercase, yellow highlight — max 3 words/line",
            "audio_sfx": "Whoosh on cut" if i % 4 == 0 else "Clean dialogue",
            "purpose": "Maintains high pacing; alternates speaker perspective.",
        })
    return rows[:max_rows]


def _build_cutting_rhythm(dna: StyleDNA, reference_duration_s: float, scene_count: int) -> dict[str, Any]:
    avg_s = dna.pacing.avg_cut_duration_ms / 1000.0
    total_cuts = max(scene_count - 1, int(reference_duration_s / max(avg_s, 0.5)))
    return {
        "average_shot_duration_s": round(avg_s, 2),
        "longest_shot_s": round(min(avg_s * 1.7, 2.5), 2),
        "shortest_shot_s": round(max(avg_s * 0.4, 0.42), 2),
        "total_cuts": total_cuts,
        "jump_cut_frequency_s": round(avg_s * 1.05, 2),
        "pattern_interrupt_interval_s": 3.8,
        "subtitle_update_frequency_s": 0.38,
        "cadence_rule": (
            f"[New Visual Frame] Every {avg_s:.2f}s → "
            f"[Scale / Zoom Toggle] Every {avg_s * 2:.1f}s → "
            "[Pattern Interrupt / B-Roll] Every 3.8s"
        ),
    }


def _build_camera_spec(dna: StyleDNA) -> dict[str, Any]:
    return {
        "digital_step_zooms_pct": 65,
        "continuous_push_ins_pct": 20,
        "micro_shake_pct": 10,
        "speed_ramps_pct": 5,
        "step_crop_variants": [100, 108, 115, 122],
        "continuous_push_rate": 1.04,
        "push_easing": "cubic-bezier(0.25, 1, 0.5, 1)",
        "shake_on_impact": True,
        "shake_duration_s": 0.15,
        "invariance_rule": (
            "Subject eye position must not remain static > 1.4s — "
            "execute 5% scale jump or crop shift if no hard cut."
        ),
    }


def _build_caption_spec(dna: StyleDNA) -> dict[str, Any]:
    return {
        "font_family": "Montserrat Black / Proxima Nova",
        "font_weight": 900,
        "font_size_pct_height": 7.5,
        "case_rule": dna.captions.case.upper() if dna.captions.case else "UPPERCASE",
        "max_words_per_line": dna.captions.max_words_per_line,
        "position_y_pct": 72,
        "stroke_color": dna.captions.stroke,
        "stroke_width_px": dna.captions.stroke_width,
        "drop_shadow": {"opacity": 0.45, "blur_px": 12, "distance_px": 6, "angle_deg": 135},
        "animation_preset": dna.captions.animation or "scale_pop_in",
        "colors": {
            "base": dna.captions.color,
            "accent_primary": dna.captions.highlight_color,
            "accent_conflict": "#FF2A2A",
        },
        "tracking_cadence": "Synchronized to vocal onset; hide non-spoken tokens within 1 frame.",
    }


def _build_sound_design(dna: StyleDNA) -> dict[str, Any]:
    return {
        "target_loudness_lufs": dna.audio.normalization_target_lufs,
        "voice_eq_boost_khz": 2.5,
        "low_pass_cutoff_hz": 80,
        "sfx_library": {
            "cut_transition": "mid_frequency_whoosh",
            "emphasis_point": "sub_bass_thud",
            "data_popup": "mechanical_shutter_click",
        },
        "music_energy": dna.audio.music_energy,
        "ducking": dna.audio.ducking_aggressiveness,
    }


def _build_color_spec(dna: StyleDNA) -> dict[str, Any]:
    return {
        "contrast_boost": round(0.14 + dna.color.contrast * 0.1, 2),
        "exposure_offset": round(-0.2 + dna.color.brightness * 0.1, 2),
        "saturation_boost": round(0.06 + dna.color.saturation * 0.1, 2),
        "vibrance_boost": 0.12,
        "temperature_k": 5600,
        "clarity_boost": 0.18,
        "vignette_amount": 0.05,
        "sharpness": {"radius_px": 1.0, "amount_pct": 35},
    }


def _build_ai_yaml(dna: StyleDNA, metrics: dict[str, float]) -> dict[str, Any]:
    avg_s = dna.pacing.avg_cut_duration_ms / 1000.0
    return {
        "style": {
            "pacing": "hyper_accelerated" if avg_s < 1.5 else "fast",
            "energy": "high_friction",
            "average_cut_length_s": round(avg_s, 2),
            "pattern_interrupt_interval_s": 3.8,
            "intensity_metrics": metrics,
        },
        "camera": _build_camera_spec(dna),
        "captions": {
            "font_family": "Montserrat Black",
            "transform": dna.captions.case,
            "max_words_per_line": dna.captions.max_words_per_line,
            "y_position_percent": 72,
            "stroke_color": dna.captions.stroke,
            "stroke_width_px": dna.captions.stroke_width,
            "animation_preset": "scale_pop_in",
            "color_rules": {
                "base": dna.captions.color,
                "accent_primary": dna.captions.highlight_color,
                "accent_conflict": "#FF2A2A",
            },
        },
        "audio": _build_sound_design(dna),
        "color_grade": _build_color_spec(dna),
    }


AI_EDITOR_PROMPT_TEMPLATE = """\
Act as an elite short-form video editor, trailer designer, and retention specialist. \
Transform the provided talking-head footage into a high-stakes, fast-paced style by executing:

1. PACING: Eliminate pauses and dead air. Alternate speakers every sentence swap. \
Never hold one angle > 1.4s. Digital zoom crops at 100%/108%/115%. B-roll every 3.8s.

2. CAPTIONS: Lower-third center (72% Y), uppercase, max 3 words/line, 8px black stroke, \
yellow (#FFE600) emphasis on key words, scale-pop on word onset.

3. SOUND: -14 LUFS, cut below 80Hz, sub-bass thud on emphasis, whoosh on cuts, \
shutter click on data overlays.

4. COLOR: +14% contrast, -0.2 exposure, +18% clarity, 5% vignette.

5. RETENTION: End abruptly on unresolved high-tension question — no CTA outro.
"""


@dataclass
class ForensicStyleReport:
    """12-section forensic reverse-engineering report."""
    master_template_name: str = ""
    production_pipeline: str = "Automated AI Short-Form Content Generation Engine"
    high_level: dict[str, Any] = field(default_factory=dict)
    timeline_rows: list[dict[str, Any]] = field(default_factory=list)
    cutting_rhythm: dict[str, Any] = field(default_factory=dict)
    camera_movement: dict[str, Any] = field(default_factory=dict)
    caption_spec: dict[str, Any] = field(default_factory=dict)
    graphics_motion: list[str] = field(default_factory=list)
    sound_design: dict[str, Any] = field(default_factory=dict)
    color_grade_spec: dict[str, Any] = field(default_factory=dict)
    retention_engineering: list[dict[str, Any]] = field(default_factory=list)
    editing_rulebook: list[str] = field(default_factory=list)
    ai_recreation_yaml: dict[str, Any] = field(default_factory=dict)
    ai_editor_prompt: str = ""
    draggable_tool_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "master_template_name": self.master_template_name,
            "production_pipeline": self.production_pipeline,
            "section_1_high_level": self.high_level,
            "section_2_timeline": self.timeline_rows,
            "section_3_cutting_rhythm": self.cutting_rhythm,
            "section_4_camera": self.camera_movement,
            "section_5_captions": self.caption_spec,
            "section_6_graphics_motion": self.graphics_motion,
            "section_7_sound_design": self.sound_design,
            "section_8_color_grade": self.color_grade_spec,
            "section_9_retention": self.retention_engineering,
            "section_10_rulebook": self.editing_rulebook,
            "section_11_ai_yaml": self.ai_recreation_yaml,
            "section_12_ai_prompt": self.ai_editor_prompt,
            "draggable_tool_ids": self.draggable_tool_ids,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any] | None) -> "ForensicStyleReport | None":
        if not d or not isinstance(d, dict):
            return None
        return cls(
            master_template_name=str(d.get("master_template_name", "")),
            production_pipeline=str(d.get("production_pipeline", "")),
            high_level=dict(d.get("section_1_high_level") or d.get("high_level") or {}),
            timeline_rows=list(d.get("section_2_timeline") or d.get("timeline_rows") or []),
            cutting_rhythm=dict(d.get("section_3_cutting_rhythm") or d.get("cutting_rhythm") or {}),
            camera_movement=dict(d.get("section_4_camera") or d.get("camera_movement") or {}),
            caption_spec=dict(d.get("section_5_captions") or d.get("caption_spec") or {}),
            graphics_motion=list(d.get("section_6_graphics_motion") or d.get("graphics_motion") or []),
            sound_design=dict(d.get("section_7_sound_design") or d.get("sound_design") or {}),
            color_grade_spec=dict(d.get("section_8_color_grade") or d.get("color_grade_spec") or {}),
            retention_engineering=list(d.get("section_9_retention") or d.get("retention_engineering") or []),
            editing_rulebook=list(d.get("section_10_rulebook") or d.get("editing_rulebook") or []),
            ai_recreation_yaml=dict(d.get("section_11_ai_yaml") or d.get("ai_recreation_yaml") or {}),
            ai_editor_prompt=str(d.get("section_12_ai_prompt") or d.get("ai_editor_prompt") or ""),
            draggable_tool_ids=list(d.get("draggable_tool_ids") or []),
        )


DEFAULT_RULEBOOK = [
    "Every data metric or admission must trigger a visual change within 2 frames.",
    "Condense explanations > 4 sentences with jump-cuts masked by B-roll.",
    "Captions: max 3 words on screen; color snaps to vocal delivery.",
    "Alternate camera scale on every speaker cut (never 100% → 100%).",
    "Music tempo locked; low-pass during policy breakdowns, full spectrum at peaks.",
]


def build_forensic_report(
    dna: StyleDNA,
    scenes: list[dict],
    reference_duration_s: float,
    vision: "VisionAnalysisResult | None" = None,
    preset_name: str = "",
    tool_ids: list[str] | None = None,
) -> ForensicStyleReport:
    """
    Build a forensic reverse-engineering report from extraction artifacts.
    """
    metrics = _intensity_from_dna(dna)
    avg_s = dna.pacing.avg_cut_duration_ms / 1000.0
    cpm = dna.pacing.cuts_per_minute

    philosophy = (
        "Aggressive, high-stakes confrontation style. Strips slow podcast pacing; "
        "every cut and sound element heightens tension and eliminates dead air."
        if cpm > 35 or avg_s < 1.5
        else "Fast-paced analytical short-form. Tight cuts with emphasis on clarity and retention."
    )

    high_level = {
        "editing_philosophy": philosophy,
        "emotional_tone": "High-friction, urgent, confrontational yet intellectual.",
        "target_audience": (
            "Young, politically-aware digital natives with low attention spans "
            "who value data-driven cross-examinations."
        ),
        "viewer_psychology": [
            "Clash of Titans — interviewer vs subject challenging core logic.",
            "Gotcha Hook — viewer stays to see if subject breaks or defends.",
        ],
        "hook_strategy": (
            f"First {dna.hook.hook_duration_s:.0f}s bypass greetings; "
            f"open with bold claim or question ({dna.hook.hook_type.replace('_', ' ')})."
        ),
        "retention_mechanisms": [
            "Ultra-fast alternation: micro-zooms, perspective cuts, B-roll inserts.",
            "Audio punctuation: low-end hits and whoosh sweeps on pivots.",
        ],
        "visual_pacing": (
            f"Hyper-accelerated — reject visual stability; break loop if angle holds > 1.5s."
            if avg_s < 1.5
            else f"Fast — average shot {avg_s:.1f}s with regular pattern interrupts."
        ),
        "narrative_structure": [
            {"act": "Premise Setup", "window": "00:00–00:10", "focus": "Intellectual framing"},
            {"act": "Direct Challenge", "window": "00:11–00:27", "focus": "Accountability admissions"},
            {"act": "Data Duel", "window": "00:28–00:52", "focus": "Policy and metrics debate"},
            {"act": "Ideological Friction", "window": "00:53–01:13", "focus": "Colloquial reality-checks"},
            {"act": "Unresolved Loop", "window": "01:14–end", "focus": "Open question cutoff"},
        ],
        "energy_curve": (
            "Baseline 8/10 → spikes to 9.5/10 on admissions → analytical 8.5/10 "
            "during data → peak 10/10 on disagreement → open-loop ending."
        ),
        "intensity_metrics": metrics,
    }

    timeline_rows = _build_timeline_rows(scenes, reference_duration_s, vision)

    graphics = [
        "Data verification overlays — slate card slides from right on metrics.",
        "Directional motion arrows on economic/system linkages.",
        "Red/green bounding boxes pulse on conflicts and admissions.",
        "2-frame white flash (15% opacity) as palate cleanser between ideas.",
    ]

    retention = [
        {
            "name": "Immediate Curiosity Loop",
            "window": "00:00–00:04",
            "mechanism": "Open mid-sentence; skip introductions to force context curiosity.",
        },
        {
            "name": "Rapid Validation Frame",
            "window": "00:05–00:11",
            "mechanism": "Guest validates host approach early — rewards staying past hook.",
        },
        {
            "name": "Unresolved Tension End-Loop",
            "window": "final 2s",
            "mechanism": "Cut on cliffhanger question — drives rewatch and full-video click-through.",
        },
    ]

    report = ForensicStyleReport(
        master_template_name=preset_name or dna.source_title or "Extracted Reference Style",
        high_level=high_level,
        timeline_rows=timeline_rows,
        cutting_rhythm=_build_cutting_rhythm(dna, reference_duration_s, len(scenes)),
        camera_movement=_build_camera_spec(dna),
        caption_spec=_build_caption_spec(dna),
        graphics_motion=graphics,
        sound_design=_build_sound_design(dna),
        color_grade_spec=_build_color_spec(dna),
        retention_engineering=retention,
        editing_rulebook=list(DEFAULT_RULEBOOK),
        ai_recreation_yaml=_build_ai_yaml(dna, metrics),
        ai_editor_prompt=AI_EDITOR_PROMPT_TEMPLATE,
        draggable_tool_ids=tool_ids or [],
    )
    return report


def enrich_forensic_with_llm(report: ForensicStyleReport, transcript_hint: str = "") -> ForensicStyleReport:
    """Optional LLM pass to refine narrative sections (non-fatal on failure)."""
    try:
        from config import settings
        if not getattr(settings, "OPENAI_API_KEY", None):
            return report
        from tasks.prompts import FORENSIC_STYLE_SYSTEM, FORENSIC_STYLE_USER
        from tasks.ai_client import call_ai
        from tasks.model_router import BudgetState

        payload = {
            "metrics": report.high_level.get("intensity_metrics"),
            "cutting_rhythm": report.cutting_rhythm,
            "caption_spec": report.caption_spec,
            "timeline_sample": report.timeline_rows[:5],
            "transcript_hint": transcript_hint[:2000],
        }
        import json
        user = FORENSIC_STYLE_USER.format(analysis_json=json.dumps(payload, ensure_ascii=False)[:12000])
        ai = call_ai(
            system=FORENSIC_STYLE_SYSTEM,
            user=user,
            task_type="style_forensic",
            budget=BudgetState(),
            max_tokens=2500,
            temperature=0.3,
        )
        result = ai.content if isinstance(ai.content, dict) else {}
        if result:
            if result.get("editing_philosophy"):
                report.high_level["editing_philosophy"] = result["editing_philosophy"]
            if result.get("hook_strategy"):
                report.high_level["hook_strategy"] = result["hook_strategy"]
            if result.get("editing_rulebook"):
                report.editing_rulebook = result["editing_rulebook"]
            if result.get("ai_editor_prompt"):
                report.ai_editor_prompt = result["ai_editor_prompt"]
    except Exception as exc:
        log.warning("forensic_llm_enrich_skipped: %s", exc)
    return report
