"""
ViraEdit — Style Applicator (EP-2.8 / T-2.8.3).

Applies a StyleDNA to a timeline data dict.

Design rules (mirrors suggestion_apply.py):
  • Pure function: apply(components, dna, timeline_data, strength) → modified_data
  • No database access, no async — called from the sync part of the API
  • Non-destructive: always returns a copy, never mutates the input
  • strength: 0.0 = no change, 1.0 = full copy of reference style
  • Only the components listed are applied — others are untouched

Applied components modify the timeline dict as follows:
  captions    → sets CaptionStyle effect on all caption track clips
  color       → adds/replaces color_grade effect on all video clips
  transitions → sets "out" transition on all video clip boundaries
  audio       → adds/replaces audio_normalize effect on all audio clips
  pacing      → splits long video clips + stores pacing target in metadata
  hook        → adds hook text overlay at timeline start
  visuals     → adds informational overlay clips based on density/style
  broll       → adds b-roll placeholder overlays at intervals
"""
from __future__ import annotations

import copy
import logging
import uuid
from typing import Any

from .models import StyleDNA

log = logging.getLogger("viraedit.style_transfer.applicator")

_HOOK_LABELS: dict[str, str] = {
    "bold_claim": "Watch this —",
    "story": "Story time",
    "reaction": "Wait for it…",
    "question": "Did you know?",
    "tutorial": "Here's how",
}

_OVERLAY_DENSITY_COUNTS: dict[str, int] = {
    "sparse": 1,
    "moderate": 2,
    "dense": 4,
}

_TEXT_STYLE_VISUAL: dict[str, str] = {
    "minimal": "key_term",
    "bold": "statistic",
    "neon": "large_number",
    "corporate": "cta",
}

_BROLL_FREQ_COUNTS: dict[str, int] = {
    "low": 1,
    "medium": 2,
    "high": 4,
}


class StyleApplicator:
    """
    Applies extracted StyleDNA to a timeline data dict.

    Usage:
        applicator = StyleApplicator()
        new_data = applicator.apply(
            timeline_data,
            dna=my_style,
            components=["captions", "color"],
            strength=0.8,
        )
    """

    def apply(
        self,
        timeline_data: dict[str, Any],
        dna: StyleDNA,
        components: list[str],
        strength: float = 1.0,
    ) -> dict[str, Any]:
        """
        Apply the given style components to the timeline.

        Args:
            timeline_data: Current timeline JSONB data dict (read-only).
            dna:           Extracted StyleDNA to apply.
            components:    Which components to apply. Valid values:
                           "captions", "color", "transitions", "audio", "pacing",
                           "hook", "visuals", "broll"
            strength:      0.0 = no change, 1.0 = fully match reference style.

        Returns:
            A new timeline data dict with the selected style components applied.
        """
        strength = max(0.0, min(1.0, float(strength)))
        data = copy.deepcopy(timeline_data)

        _HANDLERS = {
            "captions":    self._apply_captions,
            "color":       self._apply_color,
            "transitions": self._apply_transitions,
            "audio":       self._apply_audio,
            "pacing":      self._apply_pacing,
            "hook":        self._apply_hook,
            "visuals":     self._apply_visuals,
            "broll":       self._apply_broll,
        }

        applied: list[str] = []
        for component in components:
            handler = _HANDLERS.get(component)
            if handler is None:
                log.warning("style_apply_unknown_component: %s", component)
                continue
            data = handler(data, dna, strength)
            applied.append(component)

        log.info(
            "style_applied: components=%s strength=%.2f",
            applied, strength,
        )
        return data

    # ── Track / overlay helpers ───────────────────────────────────────────────

    def _get_or_create_track(
        self,
        data: dict,
        track_type: str,
        track_id: str,
        track_name: str,
    ) -> dict:
        tracks = data.setdefault("tracks", [])
        for track in tracks:
            if track.get("type") == track_type:
                return track
        new_track = {
            "id": track_id,
            "type": track_type,
            "name": track_name,
            "muted": False,
            "locked": False,
            "visible": True,
            "clips": [],
        }
        tracks.append(new_track)
        return new_track

    def _timeline_duration(self, data: dict) -> float:
        duration = float(data.get("global_settings", {}).get("duration", 0.0))
        if duration > 0:
            return duration
        max_end = 0.0
        for track in data.get("tracks", []):
            for clip in track.get("clips", []):
                max_end = max(max_end, float(clip.get("timeline_end", 0.0)))
        return max(max_end, 1.0)

    def _clear_style_overlays(self, data: dict, component: str) -> None:
        """Remove prior style-transfer overlays for a component (re-apply safe)."""
        for track in data.get("tracks", []):
            if track.get("type") != "overlay":
                continue
            kept: list[dict] = []
            for clip in track.get("clips", []):
                is_style = False
                for effect in clip.get("effects", []):
                    if effect.get("type") != "visual_overlay":
                        continue
                    params = effect.get("params", {})
                    if params.get("style_component") == component:
                        is_style = True
                        break
                if not is_style:
                    kept.append(clip)
            track["clips"] = kept

    def _add_style_overlay(
        self,
        data: dict,
        *,
        start: float,
        end: float,
        visual_type: str,
        display_value: str,
        suggested_visual: str,
        label: str,
        component: str,
    ) -> None:
        self._clear_style_overlays(data, component)
        overlay_track = self._get_or_create_track(
            data, "overlay", "track-overlay-1", "Visual Overlays"
        )
        duration = max(0.5, end - start)
        clip_id = f"style-{component}-{uuid.uuid4().hex[:8]}"
        overlay_track["clips"].append({
            "id": clip_id,
            "asset_id": "synthetic",
            "source_start": 0.0,
            "source_end": duration,
            "timeline_start": round(start, 4),
            "timeline_end": round(end, 4),
            "speed": 1.0,
            "muted": True,
            "volume": 0.0,
            "effects": [{
                "type": "visual_overlay",
                "params": {
                    "visual_type": visual_type,
                    "display_value": display_value,
                    "suggested_visual": suggested_visual,
                    "style_transfer": True,
                    "style_component": component,
                },
            }],
            "transitions": {},
            "label": label,
        })

    def _mark_pacing_clip(self, clip: dict) -> dict:
        effects = clip.setdefault("effects", [])
        effects[:] = [e for e in effects if e.get("type") != "style_pacing"]
        effects.append({
            "type": "style_pacing",
            "params": {"style_transfer": True},
        })
        return clip

    def _split_clip_for_pacing(
        self, clip: dict, target_sec: float, strength: float
    ) -> list[dict]:
        tl_start = float(clip["timeline_start"])
        tl_end = float(clip["timeline_end"])
        duration = tl_end - tl_start
        src_start = float(clip.get("source_start", tl_start))
        src_end = float(clip.get("source_end", tl_end))
        src_duration = src_end - src_start

        if duration <= 0.01:
            return [self._mark_pacing_clip(copy.deepcopy(clip))]

        if duration <= target_sec * 1.25:
            return [self._mark_pacing_clip(copy.deepcopy(clip))]

        num_segments_ideal = duration / target_sec
        max_segs = max(2, round(num_segments_ideal))
        n_segs = max(1, round(1 + (max_segs - 1) * strength))
        n_segs = min(n_segs, max(1, int(duration / 0.5)))
        seg_sec = duration / n_segs

        if n_segs <= 1 or duration <= seg_sec * 1.2:
            return [self._mark_pacing_clip(copy.deepcopy(clip))]

        base_id = str(clip.get("id", "clip"))
        segments: list[dict] = []
        cursor_tl = tl_start
        cursor_src = src_start
        src_per_tl = src_duration / duration if duration > 0 else 1.0

        for idx in range(n_segs):
            remaining = tl_end - cursor_tl
            if remaining <= 0.05:
                break
            seg_dur = min(seg_sec, remaining)
            seg = copy.deepcopy(clip)
            seg["id"] = f"{base_id}-pace-{idx}"
            seg["timeline_start"] = round(cursor_tl, 4)
            seg["timeline_end"] = round(cursor_tl + seg_dur, 4)
            seg["source_start"] = round(cursor_src, 4)
            seg["source_end"] = round(cursor_src + seg_dur * src_per_tl, 4)
            if idx > 0 or not clip.get("label"):
                seg["label"] = f"Cut {idx + 1}"
            segments.append(self._mark_pacing_clip(seg))
            cursor_tl += seg_dur
            cursor_src += seg_dur * src_per_tl

        if segments and segments[-1]["timeline_end"] < tl_end - 0.01:
            segments[-1]["timeline_end"] = round(tl_end, 4)
            segments[-1]["source_end"] = round(src_end, 4)

        return segments or [self._mark_pacing_clip(copy.deepcopy(clip))]

    def _sync_audio_to_video_splits(self, data: dict) -> None:
        video_clips: list[dict] = []
        for track in data.get("tracks", []):
            if track.get("type") == "video":
                video_clips = sorted(
                    track.get("clips", []),
                    key=lambda c: float(c.get("timeline_start", 0.0)),
                )
                break
        if not video_clips:
            return

        for track in data.get("tracks", []):
            if track.get("type") != "audio":
                continue
            audio_clips = track.get("clips", [])
            if not audio_clips:
                continue
            template = copy.deepcopy(audio_clips[0])
            new_audio: list[dict] = []
            for i, vclip in enumerate(video_clips):
                aclip = copy.deepcopy(template)
                aclip["id"] = f"{template.get('id', 'audio')}-pace-{i}"
                aclip["timeline_start"] = vclip["timeline_start"]
                aclip["timeline_end"] = vclip["timeline_end"]
                aclip["source_start"] = vclip.get("source_start", vclip["timeline_start"])
                aclip["source_end"] = vclip.get("source_end", vclip["timeline_end"])
                new_audio.append(aclip)
            track["clips"] = new_audio

    # ── Component applicators ─────────────────────────────────────────────────

    def _apply_captions(
        self, data: dict, dna: StyleDNA, strength: float
    ) -> dict:
        """
        Apply caption style to all caption-track clips.
        Adds/replaces a "caption_style" effect on each clip.
        Preserves Nepali text content — only changes visual presentation.
        """
        cap = dna.captions
        style_params = {
            "position": cap.position,
            "color": cap.color,
            "stroke": cap.stroke,
            "stroke_width": round(cap.stroke_width * strength),
            "animation": cap.animation if strength >= 0.5 else "none",
            "max_words_per_line": cap.max_words_per_line,
            "case": cap.case if strength >= 0.5 else "normal",
            "highlight_color": cap.highlight_color,
            "background_opacity": round(cap.background_opacity * strength, 3),
            "font_size_vw": cap.font_size_vw,
        }

        for track in data.get("tracks", []):
            if track.get("type") != "captions":
                continue
            track.setdefault("style", {}).update(style_params)
            for clip in track.get("clips", []):
                effects = clip.setdefault("effects", [])
                effects[:] = [
                    e for e in effects if e.get("type") != "caption_style"
                ]
                effects.append({
                    "type": "caption_style",
                    "params": style_params,
                })
        return data

    def _apply_color(
        self, data: dict, dna: StyleDNA, strength: float
    ) -> dict:
        """Add/replace color_grade effect on all video clips."""
        c = dna.color
        grade = {
            "brightness": round(c.brightness * strength, 3),
            "contrast": round(c.contrast * strength, 3),
            "saturation": round(c.saturation * strength, 3),
            "temperature": round(c.temperature * strength, 3),
            "shadows": round(c.shadows * strength, 3),
            "highlights": round(c.highlights * strength, 3),
        }
        effect = {"type": "color_grade", "params": grade}

        for track in data.get("tracks", []):
            if track.get("type") != "video":
                continue
            for clip in track.get("clips", []):
                effects = clip.setdefault("effects", [])
                effects[:] = [
                    e for e in effects if e.get("type") != "color_grade"
                ]
                effects.append(effect)
        return data

    def _apply_transitions(
        self, data: dict, dna: StyleDNA, strength: float
    ) -> dict:
        """Set the primary transition type on all video clip boundaries."""
        t = dna.transitions
        duration = t.avg_duration_ms / 1000.0 * strength
        duration = round(max(0.0, min(2.0, duration)), 3)
        t_type = t.primary_type if strength >= 0.5 else "cut"

        for track in data.get("tracks", []):
            if track.get("type") != "video":
                continue
            clips = track.get("clips", [])
            for i, clip in enumerate(clips):
                transitions = clip.setdefault("transitions", {})
                if i < len(clips) - 1:
                    transitions["out"] = {
                        "type": t_type,
                        "duration": duration,
                    }
        return data

    def _apply_audio(
        self, data: dict, dna: StyleDNA, strength: float
    ) -> dict:
        """Add/replace audio normalization on all audio clips."""
        a = dna.audio
        effect = {
            "type": "audio_normalize",
            "params": {
                "target_lufs": a.normalization_target_lufs,
                "ducking": a.ducking_aggressiveness,
                "strength": strength,
            },
        }
        for track in data.get("tracks", []):
            if track.get("type") != "audio":
                continue
            for clip in track.get("clips", []):
                effects = clip.setdefault("effects", [])
                effects[:] = [
                    e for e in effects if e.get("type") != "audio_normalize"
                ]
                effects.append(effect)
        return data

    def _apply_pacing(
        self, data: dict, dna: StyleDNA, strength: float
    ) -> dict:
        """
        Split long video clips toward the reference cut length and store metadata.
        Audio clips are re-segmented to match video boundaries.
        """
        p = dna.pacing
        metadata = data.setdefault("metadata", {})
        metadata["pacing_target"] = {
            "avg_cut_duration_ms": p.avg_cut_duration_ms,
            "cuts_per_minute": p.cuts_per_minute,
            "rhythm": p.rhythm,
            "strength": strength,
            "source_url": dna.source_url,
        }

        if strength < 0.05:
            return data

        target_sec = max(0.5, p.avg_cut_duration_ms / 1000.0)
        clips_before = 0
        clips_after = 0

        for track in data.get("tracks", []):
            if track.get("type") != "video":
                continue
            clips_before = len(track.get("clips", []))
            new_clips: list[dict] = []
            for clip in track.get("clips", []):
                new_clips.extend(
                    self._split_clip_for_pacing(clip, target_sec, strength)
                )
            track["clips"] = new_clips
            clips_after = len(new_clips)

        self._sync_audio_to_video_splits(data)

        metadata["pacing_applied"] = {
            "target_cut_ms": p.avg_cut_duration_ms,
            "clips_before": clips_before,
            "clips_after": clips_after,
            "strength": strength,
        }
        return data

    def _apply_hook(
        self, data: dict, dna: StyleDNA, strength: float
    ) -> dict:
        """Add a hook text overlay at timeline start when reference uses one."""
        h = dna.hook
        metadata = data.setdefault("metadata", {})
        metadata["hook_style"] = {
            "hook_type": h.hook_type,
            "hook_duration_s": h.hook_duration_s,
            "uses_text_hook_overlay": h.uses_text_hook_overlay,
            "strength": strength,
        }

        if strength < 0.3:
            return data
        if not h.uses_text_hook_overlay and strength < 0.6:
            return data

        duration = max(2.0, h.hook_duration_s * strength)
        text = _HOOK_LABELS.get(h.hook_type, "Hook")
        self._add_style_overlay(
            data,
            start=0.0,
            end=duration,
            visual_type="hook_rewrite",
            display_value=text,
            suggested_visual="text_overlay",
            label=f"Hook: {h.hook_type.replace('_', ' ')}",
            component="hook",
        )
        return data

    def _apply_visuals(
        self, data: dict, dna: StyleDNA, strength: float
    ) -> dict:
        """Add informational overlay clips based on reference visual density."""
        v = dna.visuals
        metadata = data.setdefault("metadata", {})
        metadata["visual_style"] = {
            "uses_text_overlays": v.uses_text_overlays,
            "text_style": v.text_style,
            "overlay_density": v.overlay_density,
            "uses_arrows_circles": v.uses_arrows_circles,
            "strength": strength,
        }

        if strength < 0.3 or not v.uses_text_overlays:
            return data

        duration = self._timeline_duration(data)
        base_count = _OVERLAY_DENSITY_COUNTS.get(v.overlay_density, 1)
        count = max(1, round(base_count * strength)) if strength >= 0.5 else 0
        if count == 0:
            return data

        visual_type = _TEXT_STYLE_VISUAL.get(v.text_style, "key_term")
        seg_dur = max(2.0, 3.0 * strength)

        for i in range(count):
            start = duration * (i + 1) / (count + 1)
            end = min(duration, start + seg_dur)
            self._add_style_overlay(
                data,
                start=start,
                end=end,
                visual_type=visual_type,
                display_value=f"Visual {i + 1}",
                suggested_visual="animated_graphic",
                label=f"Visual: {v.text_style}",
                component=f"visual-{i}",
            )

        if v.uses_arrows_circles and strength >= 0.5:
            callout_start = duration * 0.25
            self._add_style_overlay(
                data,
                start=callout_start,
                end=min(duration, callout_start + seg_dur),
                visual_type="callout",
                display_value="Highlight",
                suggested_visual="arrow_circle",
                label="Visual: callout",
                component="visual-callout",
            )
        return data

    def _apply_broll(
        self, data: dict, dna: StyleDNA, strength: float
    ) -> dict:
        """Add b-roll placeholder overlays spaced by reference frequency."""
        b = dna.broll
        metadata = data.setdefault("metadata", {})
        metadata["broll_style"] = {
            "frequency": b.frequency,
            "avg_broll_duration_ms": b.avg_broll_duration_ms,
            "broll_timing": b.broll_timing,
            "strength": strength,
        }

        if strength < 0.3:
            return data

        duration = self._timeline_duration(data)
        base_count = _BROLL_FREQ_COUNTS.get(b.frequency, 1)
        count = max(1, round(base_count * strength)) if strength >= 0.5 else 0
        if count == 0:
            return data

        broll_dur = max(1.0, (b.avg_broll_duration_ms / 1000.0) * strength)

        for i in range(count):
            if b.broll_timing == "rhythmic":
                start = i * (duration / max(count, 1))
            elif b.broll_timing == "random":
                start = duration * (i + 0.5) / (count + 1)
            else:
                start = duration * (i + 1) / (count + 1)
            end = min(duration, start + broll_dur)
            self._add_style_overlay(
                data,
                start=start,
                end=end,
                visual_type="broll_insert",
                display_value="B-roll",
                suggested_visual="broll_placeholder",
                label=f"B-roll {i + 1}",
                component=f"broll-{i}",
            )
        return data
