"""
Apply an EditRecipe to a timeline — once, scaled to target duration.

Rules (per product spec):
  • Scale reference edit positions to target video length (cramped OK)
  • Apply global color + caption STYLE only (never copy reference text)
  • Placeholders for logo, graphics, b-roll slots, hook headline (user's words)
  • Jump-cut formula: split takes + tighten silences on the user's transcript
  • SFX / music as visible timeline clips (user drops in their assets)
"""
from __future__ import annotations

import copy
import logging
import uuid
from typing import Any

from .edit_recipe import EditRecipe, EditRecipeEvent
from .models import StyleDNA
from .pacing_ops import (
    add_music_bed_timeline_clip,
    add_resolved_music_bed_clip,
    add_sfx_timeline_clip,
    apply_jump_cut_formula,
    remap_time_after_removals,
)
from processors.asset_matcher import (
    MATCH_THRESHOLD,
    PARTIAL_THRESHOLD,
    score_asset_against_requirement,
)
from processors.music_library import (
    get_music_track_metadata,
    map_genre_to_mood,
    pick_music_for_mood,
    should_duck_for_speech,
)
from schemas.template import SlotRequirement
from services.capability_registry import event_allowed_by_registry
from .strip_style_transfer import strip_prior_style_transfer
from .timeline_renderers import overlay_renderer_params, transition_out_payload

log = logging.getLogger("viraedit.style_transfer.recipe_applicator")

_HOOK_PLACEHOLDER = "Your hook headline"
_PLACEHOLDER_LABELS = {
    "logo": "Your logo",
    "graphic": "Your graphic",
    "broll": "Your B-roll clip",
    "hook": "Your hook headline",
    "picture_in_picture": "Your PiP clip",
    "lower_third": "Your lower third",
    "cta": "Your call to action",
}


class RecipeApplicator:
    """Apply a saved edit recipe to timeline data."""

    def __init__(self) -> None:
        self.skipped_effects: list[dict[str, Any]] = []
        self.applied_effects: list[dict[str, Any]] = []
        self.error_effects: list[dict[str, Any]] = []

    def apply(
        self,
        timeline_data: dict[str, Any],
        recipe: EditRecipe,
        dna: StyleDNA | None = None,
        strength: float = 1.0,
        preset_name: str = "",
        preset_id: str = "",
        transcript_words: list[dict[str, Any]] | None = None,
        project_id: str = "",
        audio_profile: dict[str, Any] | None = None,
        library_assets: list[dict[str, Any]] | None = None,
        user_id: str = "",
    ) -> dict[str, Any]:
        strength = max(0.0, min(1.0, float(strength)))
        self.skipped_effects = []
        self.applied_effects = []
        self.error_effects = []
        data = copy.deepcopy(timeline_data)
        data = strip_prior_style_transfer(data)
        ref_dur = max(recipe.reference_duration_s, 1.0)
        self._project_id = project_id
        self._audio_profile = audio_profile or self._audio_profile_from_dna(dna)
        self._library_assets = library_assets or []
        self._user_id = user_id

        applied_events: list[dict[str, Any]] = []
        pending_sfx: list[tuple[float, EditRecipeEvent]] = []
        pending_music: EditRecipeEvent | None = None
        removed_ranges: list[tuple[float, float]] = []

        # ── 1. Jump-cut formula first (splits + silence tighten on user transcript)
        for event in recipe.events:
            if event.kind != "jump_cut_pacing" or strength < 0.5:
                continue
            p = event.params
            meta_pacing = data.setdefault("metadata", {})
            meta_pacing["pacing_target"] = {
                "avg_cut_duration_ms": float(p.get("avg_cut_duration_ms", 2500)),
                "cuts_per_minute": float(p.get("cuts_per_minute", 24)),
                "rhythm": "constant",
                "silence_tolerance_ms": float(p.get("silence_tolerance_ms", 150)),
                "strength": strength,
                "jump_cuts": True,
                "remove_filler": bool(p.get("remove_filler", True)),
            }
            pacing_result = apply_jump_cut_formula(
                data,
                avg_cut_duration_ms=float(p.get("avg_cut_duration_ms", 2500)),
                silence_tolerance_ms=float(p.get("silence_tolerance_ms", 150)),
                strength=strength,
                transcript_words=transcript_words,
                remove_filler=bool(p.get("remove_filler", True)),
            )
            meta_pacing["pacing_applied"] = pacing_result
            for r in pacing_result.get("removed_ranges", []):
                removed_ranges.append((float(r["start"]), float(r["end"])))
            applied_events.append({"kind": event.kind, "at_s": 0.0})

        user_duration = self._target_duration(data)

        def _map_event_times(event: EditRecipeEvent) -> tuple[float, float]:
            start_s, end_s = self._scale_timestamp(
                event.start_pct, event.end_pct, user_duration,
            )
            if removed_ranges:
                start_s = remap_time_after_removals(start_s, removed_ranges)
                end_s = remap_time_after_removals(end_s, removed_ranges)
            event_zone = self._get_zone(event.start_pct)
            return start_s, end_s, event_zone

        # ── 2. Timed edits (section-anchor scaled after jump cuts)
        for event in recipe.events:
            if event.kind in ("jump_cut_pacing", "music_bed", "sfx"):
                if event.kind == "music_bed":
                    pending_music = event
                elif event.kind == "sfx" and strength >= 0.4:
                    sfx_start, _, _ = _map_event_times(event)
                    pending_sfx.append((sfx_start, event))
                continue
            allowed, toolbox_id, skip_reason = event_allowed_by_registry(
                event.kind, event.params, strength,
            )
            if not allowed:
                self._record_skipped(toolbox_id or event.kind, skip_reason or "blocked")
                continue
            if strength < 0.05 and event.kind not in ("color_grade", "caption_style"):
                continue
            start_s, end_s, zone = _map_event_times(event)
            if event.start_pct != event.end_pct:
                end_s = max(start_s + 0.5, end_s)
            if event.start_pct == event.end_pct and event.kind.startswith("transition"):
                end_s = start_s

            if event.kind == "color_grade":
                self._apply_color(data, event, strength)
                applied_events.append({"kind": event.kind, "at_s": 0.0})
            elif event.kind == "caption_style":
                self._apply_caption_style(data, event, strength)
                applied_events.append({"kind": event.kind, "at_s": 0.0})
            elif event.kind in ("hook", "logo", "graphic", "broll", "picture_in_picture", "lower_third", "cta"):
                if strength >= 0.35:
                    if event.kind == "broll":
                        self._apply_broll_slot(
                            data, event, start_s, end_s, zone, toolbox_id, preset_id=preset_id,
                        )
                    else:
                        self._add_styled_overlay(
                            data, event, start_s, end_s, toolbox_id,
                            preset_id=preset_id, zone=zone,
                        )
                    applied_events.append({"kind": event.kind, "at_s": round(start_s, 2)})
                    self._record_applied(toolbox_id or event.kind, {"at_s": round(start_s, 2)})
            elif event.kind == "digital_zoom":
                if strength >= 0.45:
                    self._add_digital_zoom_punch(data, event, start_s, end_s)
                    applied_events.append({"kind": event.kind, "at_s": round(start_s, 2)})
            elif event.kind == "zoom":
                if strength >= 0.5:
                    self._add_zoom_marker(data, event, start_s, end_s)
                    applied_events.append({"kind": event.kind, "at_s": round(start_s, 2)})
            elif event.kind == "split_screen":
                if strength >= 0.45:
                    self._apply_split_screen(data, event, start_s, end_s)
                    applied_events.append({"kind": event.kind, "at_s": round(start_s, 2)})
            elif event.kind.startswith("transition") or event.kind == "hard_cut":
                if strength >= 0.4:
                    self._apply_transition_at(data, event, start_s, strength)
                    if strength >= 0.45:
                        pending_sfx.append((
                            start_s,
                            EditRecipeEvent(
                                kind="sfx", start_pct=0, end_pct=0,
                                params={"sfx_type": "whoosh", "volume": 0.35},
                            ),
                        ))
                    applied_events.append({"kind": event.kind, "at_s": round(start_s, 2)})
                    self._record_applied(toolbox_id or event.kind, {"at_s": round(start_s, 2)})

        # ── 3. Music bed + SFX clips on timeline (music last — needs final duration)
        target_dur = self._target_duration(data)
        if pending_music and strength >= 0.35:
            if not self._apply_music_bed(data, pending_music, target_dur, strength):
                add_music_bed_timeline_clip(
                    data, target_dur, pending_music.params, strength,
                )
            applied_events.append({"kind": "music_bed", "at_s": 0.0})
        for at_s, event in pending_sfx:
            add_sfx_timeline_clip(
                data,
                at_s,
                str(event.params.get("sfx_type", "whoosh")),
                float(event.params.get("volume", 0.35)),
            )
            applied_events.append({"kind": "sfx", "at_s": round(at_s, 2)})

        meta = data.setdefault("metadata", {})
        meta["content_formula"] = {
            "policy": "structure_only",
            "description": (
                "Edit timing and styling from reference; all text, screen recordings, "
                "music, and SFX are placeholders for your own content."
            ),
        }
        meta["edit_template"] = {
            "preset_id": preset_id,
            "preset_name": preset_name,
            "reference_duration_s": ref_dur,
            "target_duration_s": target_dur,
            "events_applied": len(applied_events),
            "strength": strength,
            "source_url": (dna.source_url if dna else "") or "",
            "applied": applied_events[:40],
            "apply_summary": self.apply_summary(),
        }
        if dna:
            meta["style_source"] = {
                "source_url": dna.source_url,
                "source_title": dna.source_title,
            }

        log.info(
            "recipe_applied: events=%d target_s=%.1f ref_s=%.1f strength=%.2f",
            len(applied_events), target_dur, ref_dur, strength,
        )
        return data

    @staticmethod
    def _scale_timestamp(
        start_pct: float, end_pct: float, user_duration: float,
    ) -> tuple[float, float]:
        """
        Map reference percentage positions to user timestamps using section-anchor
        scaling (hook / body / CTA zones). Falls back to proportional for short videos.
        """
        if user_duration < 30.0:
            return (
                round(start_pct * user_duration, 3),
                round(end_pct * user_duration, 3),
            )

        hook_end = 10.0
        cta_start = max(hook_end + 10.0, user_duration - 20.0)
        body_start = hook_end
        body_end = cta_start

        def map_pct(pct: float) -> float:
            if pct <= 0.20:
                return round((pct / 0.20) * hook_end, 3)
            if pct >= 0.80:
                zone_pct = (pct - 0.80) / 0.20
                return round(cta_start + zone_pct * (user_duration - cta_start), 3)
            zone_pct = (pct - 0.20) / 0.60
            return round(body_start + zone_pct * (body_end - body_start), 3)

        scaled_start = map_pct(start_pct)
        scaled_end = map_pct(end_pct)
        if scaled_end - scaled_start < 1.0:
            scaled_end = scaled_start + max(1.0, (end_pct - start_pct) * user_duration)
        return scaled_start, scaled_end

    @staticmethod
    def _get_zone(start_pct: float) -> str:
        if start_pct <= 0.20:
            return "hook"
        if start_pct >= 0.80:
            return "cta"
        return "body"

    @staticmethod
    def _audio_profile_from_dna(dna: StyleDNA | None) -> dict[str, Any]:
        if dna is None:
            return {}
        audio = dna.audio
        ducking = (
            "music drops significantly under VO"
            if audio.ducking_aggressiveness in ("moderate", "heavy")
            else "music stays constant"
        )
        genre = audio.music_genre_hint or (
            "upbeat" if audio.music_energy in ("medium", "high") else "none"
        )
        return {
            "music_genre": genre,
            "music_energy_arc": audio.music_energy,
            "music_ducking_behavior": ducking,
        }

    def _apply_music_bed(
        self,
        data: dict[str, Any],
        event: EditRecipeEvent,
        target_dur: float,
        strength: float,
    ) -> bool:
        """Place a real bundled music track when audio profile allows. Returns True if placed."""
        profile = dict(self._audio_profile)
        if not profile:
            params = event.params
            profile = {
                "music_genre": params.get("genre_hint", "upbeat"),
                "music_energy_arc": params.get("music_energy", "medium"),
                "music_ducking_behavior": (
                    "music drops significantly under VO"
                    if params.get("ducking") in ("moderate", "heavy")
                    else "music stays constant"
                ),
            }

        genre = str(profile.get("music_genre", "upbeat"))
        if genre.lower() == "none":
            self._record_skipped("music_bed", "no_music_in_reference")
            return False

        energy_arc = str(profile.get("music_energy_arc", ""))
        mood = map_genre_to_mood(genre, energy_arc)
        track_path = pick_music_for_mood(mood)
        if not track_path.exists():
            self._record_skipped("music_bed", "no_matching_track")
            log.info("music_bed: no track found for mood '%s', leaving placeholder", mood)
            return False

        asset_id = str(uuid.uuid4())
        track_filename = track_path.name
        dest_key = (
            f"projects/{self._project_id}/assets/music/{asset_id}_{track_filename}"
            if self._project_id
            else f"library/music/{asset_id}_{track_filename}"
        )

        try:
            from processors.storage_helpers import S3Storage
            S3Storage().put_file(dest_key, track_path, "audio/mpeg")
        except Exception as exc:
            log.warning("music_bed: upload failed (%s), leaving placeholder", exc)
            self._record_skipped("music_bed", "upload_failed")
            return False

        track_meta = get_music_track_metadata(track_path)
        volume = round(float(profile.get("music_volume", 0.2)) * strength, 3)
        duck = should_duck_for_speech(profile)
        label = f"{mood.title()} music — {track_meta.get('title', track_filename)}"

        add_resolved_music_bed_clip(
            data,
            target_dur,
            asset_id=asset_id,
            storage_key=dest_key,
            volume=volume,
            duck_under_voice=duck,
            label=label,
            mood=mood,
            track_filename=track_filename,
        )
        self._record_applied("music_bed", {
            "mood": mood, "track": track_filename, "asset_id": asset_id,
        })
        log.info("music_bed: placed '%s' for mood '%s'", track_filename, mood)
        return True

    def _apply_broll_slot(
        self,
        data: dict,
        event: EditRecipeEvent,
        start_s: float,
        end_s: float,
        zone: str,
        toolbox_id: str | None,
        preset_id: str = "",
    ) -> None:
        """Resolve B-roll against the user's library or write a gap placeholder."""
        p = event.params
        description = event.label or p.get("description", "B-roll clip")
        shot_type = p.get("shot_type", "b_roll")
        energy = p.get("energy_level", "moderate")
        slot_duration = max(0.5, end_s - start_s)

        req = SlotRequirement(
            shot_type=str(shot_type),
            energy_level=str(energy),
            min_duration=max(1.0, slot_duration * 0.6),
            max_duration=slot_duration * 1.5,
            needs_face=False,
            description=str(description),
        )

        library = [
            a for a in self._library_assets
            if a.get("asset_type") == "video"
        ]
        scored = [
            (asset, score_asset_against_requirement(asset.get("tags", {}), req))
            for asset in library
        ]
        scored.sort(key=lambda x: x[1], reverse=True)

        if scored and scored[0][1] >= MATCH_THRESHOLD:
            best_asset, score = scored[0]
            match_status = "matched"
        elif scored and scored[0][1] >= PARTIAL_THRESHOLD:
            best_asset, score = scored[0]
            match_status = "partial"
        else:
            best_asset, score = None, 0.0
            match_status = "missing"

        slot_id = p.get("slot_id") or f"broll_{int(start_s * 100)}"

        if match_status in ("matched", "partial") and best_asset:
            self._add_broll_clip(
                data, event, start_s, end_s, zone, toolbox_id, preset_id,
                slot_id=slot_id,
                asset=best_asset,
                match_status=match_status,
                match_score=score,
                description=str(description),
                is_placeholder=match_status == "partial",
                gap_resolution_needed=match_status == "partial",
            )
            self._record_applied("broll", {
                "slot_id": slot_id,
                "match_status": match_status,
                "asset_id": best_asset.get("id"),
                "score": score,
            })
            log.info("broll slot '%s': %s (score=%.2f)", slot_id, match_status, score)
            return

        self._add_broll_placeholder(
            data, event, start_s, end_s, zone, toolbox_id, preset_id,
            slot_id=slot_id,
            description=str(description),
            requirement=req.model_dump(),
        )
        self._record_applied("broll", {
            "slot_id": slot_id,
            "match_status": "missing",
            "gap_resolution_needed": True,
        })
        log.info("broll slot '%s': missing — placeholder for gap resolver", slot_id)

    def _add_broll_clip(
        self,
        data: dict,
        event: EditRecipeEvent,
        start: float,
        end: float,
        zone: str,
        toolbox_id: str | None,
        preset_id: str,
        *,
        slot_id: str,
        asset: dict[str, Any],
        match_status: str,
        match_score: float,
        description: str,
        is_placeholder: bool,
        gap_resolution_needed: bool,
    ) -> None:
        track = self._get_or_create_overlay_track(data)
        asset_url = ""
        storage_key = asset.get("storage_key", "")
        if storage_key:
            try:
                from processors.storage_helpers import S3Storage
                asset_url = S3Storage().get_presigned_url(storage_key, expires=86400)
            except Exception:
                pass

        duration = max(0.5, end - start)
        clip_id = f"broll_{slot_id}"
        track["clips"].append({
            "id": clip_id,
            "asset_id": str(asset.get("id", "synthetic")),
            "source_start": 0.0,
            "source_end": duration,
            "timeline_start": round(start, 4),
            "timeline_end": round(end, 4),
            "speed": 1.0,
            "muted": True,
            "volume": 0.0,
            "is_placeholder": is_placeholder,
            "gap_resolution_needed": gap_resolution_needed,
            "gap_metadata": {
                "slot_id": slot_id,
                "match_status": match_status,
                "match_score": round(match_score, 3),
                "description": description,
            },
            "effects": [{
                "type": "visual_overlay",
                "params": {
                    "visual_type": "broll_overlay",
                    "display_value": "",
                    "overlay_mode": "fullscreen",
                    "style_transfer": True,
                    "style_component": "recipe-broll",
                    "content_policy": event.content_policy,
                    "is_placeholder": is_placeholder,
                    "media_url": asset_url,
                    "storage_key": storage_key,
                    "zone": zone,
                    "toolbox_id": toolbox_id,
                    "preset_id": preset_id,
                },
            }],
            "transitions": {},
            "label": "B-Roll",
        })

    def _add_broll_placeholder(
        self,
        data: dict,
        event: EditRecipeEvent,
        start: float,
        end: float,
        zone: str,
        toolbox_id: str | None,
        preset_id: str,
        *,
        slot_id: str,
        description: str,
        requirement: dict[str, Any],
    ) -> None:
        track = self._get_or_create_overlay_track(data)
        duration = max(0.5, end - start)
        clip_id = f"broll_{slot_id}"
        track["clips"].append({
            "id": clip_id,
            "asset_id": "synthetic",
            "source_start": 0.0,
            "source_end": duration,
            "timeline_start": round(start, 4),
            "timeline_end": round(end, 4),
            "speed": 1.0,
            "muted": True,
            "volume": 0.0,
            "is_placeholder": True,
            "gap_resolution_needed": True,
            "gap_metadata": {
                "slot_id": slot_id,
                "match_status": "missing",
                "match_score": 0.0,
                "description": description,
                "requirement": requirement,
                "user_id": self._user_id,
            },
            "effects": [{
                "type": "visual_overlay",
                "params": {
                    "visual_type": "broll_overlay",
                    "display_value": "",
                    "overlay_mode": "fullscreen",
                    "style_transfer": True,
                    "style_component": "recipe-broll",
                    "content_policy": event.content_policy,
                    "is_placeholder": True,
                    "zone": zone,
                    "toolbox_id": toolbox_id,
                    "preset_id": preset_id,
                },
            }],
            "transitions": {},
            "label": "B-Roll (needs footage)",
        })

    def _record_skipped(self, toolbox_id: str, reason: str) -> None:
        self.skipped_effects.append({"toolbox_id": toolbox_id, "reason": reason})

    def _record_applied(self, toolbox_id: str, params: dict[str, Any]) -> None:
        self.applied_effects.append({"toolbox_id": toolbox_id, **params})

    def apply_summary(self) -> dict[str, Any]:
        return {
            "applied": self.applied_effects,
            "skipped": self.skipped_effects,
            "errors": self.error_effects,
            "applied_count": len(self.applied_effects),
            "skipped_count": len(self.skipped_effects),
        }

    def _target_duration(self, data: dict) -> float:
        gs = data.get("global_settings", {})
        dur = float(gs.get("duration", 0.0))
        if dur > 0:
            return dur
        max_end = 0.0
        for track in data.get("tracks", []):
            for clip in track.get("clips", []):
                max_end = max(max_end, float(clip.get("timeline_end", 0.0)))
        return max(max_end, 1.0)

    def _apply_color(self, data: dict, event: EditRecipeEvent, strength: float) -> None:
        p = event.params
        grade = {
            "brightness": round(float(p.get("brightness", 0)) * strength, 3),
            "contrast": round(float(p.get("contrast", 0)) * strength, 3),
            "saturation": round(float(p.get("saturation", 0)) * strength, 3),
            "temperature": round(float(p.get("temperature", 0)) * strength, 3),
            "shadows": round(float(p.get("shadows", 0)) * strength, 3),
            "highlights": round(float(p.get("highlights", 0)) * strength, 3),
        }
        effect = {"type": "color_grade", "params": {**grade, "style_transfer": True}}
        for track in data.get("tracks", []):
            if track.get("type") != "video":
                continue
            for clip in track.get("clips", []):
                effects = clip.setdefault("effects", [])
                effects[:] = [e for e in effects if e.get("type") != "color_grade"]
                effects.append(effect)

    def _apply_caption_style(self, data: dict, event: EditRecipeEvent, strength: float) -> None:
        p = event.params
        style_params = {
            "position": p.get("position", "bottom"),
            "color": p.get("color", "#FFFFFF"),
            "stroke": p.get("stroke", "#000000"),
            "stroke_width": round(int(p.get("stroke_width", 3)) * strength),
            "animation": p.get("animation", "none") if strength >= 0.5 else "none",
            "max_words_per_line": int(p.get("max_words_per_line", 3)),
            "case": p.get("case", "normal") if strength >= 0.5 else "normal",
            "highlight_color": p.get("highlight_color", "#FFD700"),
            "background_opacity": round(float(p.get("background_opacity", 0)) * strength, 3),
            "font_size_vw": float(p.get("font_size_vw", 5.0)),
        }
        for track in data.get("tracks", []):
            if track.get("type") != "captions":
                continue
            track.setdefault("style", {}).update({**style_params, "style_transfer": True})
            for clip in track.get("clips", []):
                effects = clip.setdefault("effects", [])
                effects[:] = [e for e in effects if e.get("type") != "caption_style"]
                effects.append({
                    "type": "caption_style",
                    "params": {**style_params, "style_transfer": True},
                })

        meta = data.setdefault("metadata", {})
        meta["caption_style"] = dict(style_params)

    def _get_or_create_overlay_track(self, data: dict) -> dict:
        for track in data.get("tracks", []):
            if track.get("type") == "overlay":
                return track
        track = {
            "id": "track-overlay-1",
            "type": "overlay",
            "name": "Visual Overlays",
            "muted": False,
            "locked": False,
            "visible": True,
            "clips": [],
        }
        data.setdefault("tracks", []).append(track)
        return track

    def _add_styled_overlay(
        self,
        data: dict,
        event: EditRecipeEvent,
        start: float,
        end: float,
        toolbox_id: str | None = None,
        preset_id: str = "",
        zone: str = "body",
    ) -> None:
        track = self._get_or_create_overlay_track(data)
        p = event.params
        renderer_meta = overlay_renderer_params(event.kind, p)
        # Text/brand overlays must never collapse into B-roll placeholders.
        explicit_visual_types = {
            "hook": "hook_rewrite",
            "lower_third": "lower_third",
            "cta": "cta_banner",
            "graphic": "title_banner",
            "logo": "logo",
        }
        force_non_broll = event.kind in explicit_visual_types
        visual_type = str(
            explicit_visual_types.get(event.kind)
            or renderer_meta.get("visual_type")
            or p.get("visual_type", event.kind)
        )
        if event.kind == "hook" and not renderer_meta.get("visual_type"):
            visual_type = str(p.get("visual_type", "title_banner"))
        overlay_mode = str(renderer_meta.get("overlay_mode") or p.get("overlay_mode", "corner"))
        is_broll = (
            not force_non_broll
            and event.kind == "broll"
            or visual_type in ("broll_insert", "broll_overlay", "screen_recording", "broll_cutaway")
            or bool(p.get("broll_type"))
        )
        if is_broll:
            overlay_mode = "fullscreen"
            visual_type = "broll_overlay"

        display = _PLACEHOLDER_LABELS.get(event.kind, "Placeholder")
        if event.kind == "hook":
            display = _HOOK_PLACEHOLDER
        if event.kind == "lower_third":
            display = _PLACEHOLDER_LABELS["lower_third"]
        if is_broll:
            display = ""
        if not display and not is_broll:
            display = event.label or _PLACEHOLDER_LABELS.get(event.kind, "Overlay")

        overlay_params: dict[str, Any] = {
            "visual_type": visual_type,
            "display_value": display,
            "suggested_visual": p.get("suggested_visual", "placeholder"),
            "style_transfer": True,
            "style_component": f"recipe-{event.kind}",
            "content_policy": event.content_policy,
            "is_placeholder": event.kind != "screen_recording",
            "overlay_mode": overlay_mode,
            "broll_type": p.get("broll_type", ""),
            "x_pct": renderer_meta.get("x_pct", 50 if overlay_mode == "fullscreen" else 50),
            "y_pct": renderer_meta.get("y_pct", 50 if overlay_mode == "fullscreen" else 18),
            "width_pct": 100 if overlay_mode == "fullscreen" else None,
            "height_pct": 100 if overlay_mode == "fullscreen" else None,
            "media_url": p.get("media_url", ""),
        }
        if renderer_meta.get("renderer"):
            overlay_params["renderer"] = renderer_meta["renderer"]
        if toolbox_id or renderer_meta.get("toolbox_id"):
            overlay_params["toolbox_id"] = toolbox_id or renderer_meta.get("toolbox_id")
        if preset_id:
            overlay_params["preset_id"] = preset_id
        if renderer_meta.get("animation"):
            overlay_params["animation"] = renderer_meta["animation"]
        if renderer_meta.get("position"):
            overlay_params["position"] = renderer_meta["position"]
        if zone:
            overlay_params["zone"] = zone

        clip_id = f"recipe-{event.kind}-{uuid.uuid4().hex[:8]}"
        duration = max(0.5, end - start)
        track["clips"].append({
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
                "params": overlay_params,
            }],
            "transitions": {},
            "label": "B-Roll" if is_broll else (event.label or display),
        })

    def _add_placeholder_overlay(
        self, data: dict, event: EditRecipeEvent, start: float, end: float,
    ) -> None:
        self._add_styled_overlay(data, event, start, end)

    def _snap_to_nearest_cut(
        self, data: dict, target_time: float, snap_window: float = 3.0,
    ) -> float:
        """Nearest video clip boundary within snap_window seconds."""
        nearest = target_time
        min_dist = snap_window
        for track in data.get("tracks", []):
            if track.get("type") != "video":
                continue
            for clip in track.get("clips", []):
                for boundary in (
                    float(clip.get("timeline_start", 0)),
                    float(clip.get("timeline_end", 0)),
                ):
                    dist = abs(boundary - target_time)
                    if dist < min_dist:
                        min_dist = dist
                        nearest = boundary
        return nearest

    def _apply_transition_at(
        self, data: dict, event: EditRecipeEvent, at_s: float, strength: float,
    ) -> None:
        snap_time = self._snap_to_nearest_cut(data, at_s)
        payload = transition_out_payload(event.kind, event.params, strength)
        t_type = str(payload.get("type", "cut"))

        for track in data.get("tracks", []):
            if track.get("type") != "video":
                continue
            clips = track.get("clips", [])
            if not clips:
                continue
            best_i = 0
            best_dist = float("inf")
            for i, clip in enumerate(clips):
                end_t = float(clip.get("timeline_end", 0))
                dist = abs(end_t - snap_time)
                if dist < best_dist:
                    best_dist = dist
                    best_i = i
            if best_dist > 3.0:
                continue
            clip = clips[best_i]
            if best_i >= len(clips) - 1 and t_type != "cut":
                continue
            transitions = clip.setdefault("transitions", {})
            transitions["out"] = {**payload, "at_s": round(snap_time, 3)}

    def _add_digital_zoom_punch(
        self, data: dict, event: EditRecipeEvent, start: float, end: float,
    ) -> None:
        scale_end = float(event.params.get("scale_end", 1.12))
        dur = max(0.15, min(0.6, end - start if end > start else 0.35))
        for track in data.get("tracks", []):
            if track.get("type") != "video":
                continue
            for clip in track.get("clips", []):
                cs = float(clip.get("timeline_start", 0))
                ce = float(clip.get("timeline_end", 0))
                if start >= cs and start < ce:
                    span = max(ce - cs, 0.01)
                    effects = clip.setdefault("effects", [])
                    effects.append({
                        "type": "keyframed_effect",
                        "params": {
                            "effect_type": "transform",
                            "preset_id": "digital_zoom_punch",
                            "parent_clip_id": clip.get("id", ""),
                            "style_transfer": True,
                            "keyframes": [
                                {"offset": max(0.0, (start - cs) / span), "value": 1.0},
                                {
                                    "offset": min(1.0, (start - cs + dur) / span),
                                    "value": scale_end,
                                },
                            ],
                        },
                    })
                    return

    def _add_zoom_marker(
        self, data: dict, event: EditRecipeEvent, start: float, end: float,
    ) -> None:
        for track in data.get("tracks", []):
            if track.get("type") != "video":
                continue
            for clip in track.get("clips", []):
                cs = float(clip.get("timeline_start", 0))
                ce = float(clip.get("timeline_end", 0))
                if start >= cs and start < ce:
                    effects = clip.setdefault("effects", [])
                    effects.append({
                        "type": "keyframed_effect",
                        "params": {
                            "effect_type": "filter",
                            "preset_id": "ken_burns",
                            "parent_clip_id": clip.get("id", ""),
                            "style_transfer": True,
                            "keyframes": [
                                {"offset": 0.0, "value": 1.0},
                                {"offset": 1.0, "value": float(event.params.get("scale_end", 1.08))},
                            ],
                        },
                    })
                    return

    def _apply_split_screen(
        self, data: dict, event: EditRecipeEvent, start: float, end: float,
    ) -> None:
        layout = str(event.params.get("layout", "vertical"))
        for track in data.get("tracks", []):
            if track.get("type") != "video":
                continue
            for clip in track.get("clips", []):
                cs = float(clip.get("timeline_start", 0))
                ce = float(clip.get("timeline_end", 0))
                if end <= cs or start >= ce:
                    continue
                effects = clip.setdefault("effects", [])
                effects.append({
                    "type": "layout",
                    "params": {
                        "layout_type": "split_screen",
                        "orientation": layout,
                        "style_transfer": True,
                    },
                })
                return
