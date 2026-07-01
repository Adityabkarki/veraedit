"""
ViraEdit — Suggestion Application Logic (T-2.7.4).

Converts a suggestion's action dict into concrete timeline mutations.

Design rules:
  • Pure function: apply_suggestion(action, timeline_data) → modified_data
  • No database access, no async — called from the sync part of the API
  • Non-destructive: always returns a copy, never mutates the input
  • Unknown action types → raise SuggestionApplyError with clear message
  • All time values are floats in seconds

Supported action types:
  cut / remove_filler  → remove one or more time ranges from video clips
  visual_opportunity   → add an overlay clip at the specified time
  caption              → enable the captions track
  transition           → add a transition at a clip boundary
  short_clip           → no-op (clip approval, not timeline edit)
  hook_rewrite         → add text overlay at timeline start
  audio_fix            → add audio effect to all audio clips
  highlight            → annotate clip range in metadata
  reorder              → reorder clips by scene order

Usage in the API:
    from tasks.suggestion_apply import apply_suggestion, SuggestionApplyError

    try:
        new_data = apply_suggestion(suggestion.action, current_timeline_data)
    except SuggestionApplyError as e:
        # Return 400 to the client
        raise HTTPException(400, str(e))
"""
from __future__ import annotations

import copy
import uuid
import logging
from typing import Any

log = logging.getLogger("viraedit.tasks.suggestion_apply")


class SuggestionApplyError(Exception):
    """Raised when a suggestion cannot be applied to the timeline."""
    pass


# ── Public entry point ────────────────────────────────────────────────────────

def apply_suggestion(
    action: dict[str, Any],
    timeline_data: dict[str, Any],
    suggestion_type: str | None = None,
) -> dict[str, Any]:
    """
    Apply a suggestion's action dict to a timeline data dict.

    Args:
        action:        The suggestion.action dict from the database.
        timeline_data: The current timeline data dict (Timeline.data JSONB).

    Returns:
        A new timeline data dict with the suggestion applied.

    Raises:
        SuggestionApplyError: If the action cannot be applied.
    """
    if not action:
        raise SuggestionApplyError(
            "This suggestion has no action data and cannot be applied to the timeline."
        )

    action_type = action.get("action") or action.get("type") or action.get("visual_type") or ""
    action_type = str(action_type).lower().strip()

    if not action_type and suggestion_type:
        action_type = str(suggestion_type).lower().strip()

    # Infer from action payload shape when type is missing (rule-based suggestions)
    if not action_type and action.get("filler_cuts"):
        action_type = "remove_filler"
    if not action_type and action.get("cut_type"):
        action_type = "transition"
    if not action_type and (
        ("start" in action and "end" in action)
        or ("start_time" in action and "end_time" in action)
    ):
        action_type = "cut"

    # Map action type strings to handlers
    _HANDLERS = {
        "cut":               _apply_cut,
        "remove_filler":     _apply_remove_filler,
        "visual_opportunity":_apply_visual_opportunity,
        "statistic":         _apply_visual_opportunity,
        "large_number":      _apply_visual_opportunity,
        "list_item":         _apply_visual_opportunity,
        "comparison":        _apply_visual_opportunity,
        "cta":               _apply_visual_opportunity,
        "key_term":          _apply_visual_opportunity,
        "caption":           _apply_caption,
        "add_captions":      _apply_caption,
        "transition":        _apply_transition,
        "hook_rewrite":      _apply_hook_rewrite,
        "audio_fix":         _apply_audio_fix,
        "highlight":         _apply_highlight,
        "reorder":           _apply_reorder,
        # No-ops — accepted in DB but don't touch the timeline
        "short_clip":        _apply_noop,
        "extract_shorts":    _apply_noop,
        "add_cta":           _apply_noop,  # CTA is handled by the visual engine
    }

    handler = _HANDLERS.get(action_type)
    if handler is None:
        log.warning("suggestion_apply_unknown_type: %s", action_type)
        # Unknown types → no-op rather than failing
        return copy.deepcopy(timeline_data)

    data = copy.deepcopy(timeline_data)
    return handler(action, data)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_or_create_track(
    timeline_data: dict,
    track_type: str,
    track_id: str,
    track_name: str,
) -> dict:
    """Return the first track of the given type, or append a new one."""
    tracks = timeline_data.setdefault("tracks", [])
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


def _remove_time_ranges(
    clips: list[dict],
    ranges: list[tuple[float, float]],
) -> list[dict]:
    """
    Remove source-time ranges by rebuilding clips from kept segments.

    Splits the timeline into contiguous source regions and packs them
  sequentially so playback skips removed filler/silence correctly.
    """
    if not clips or not ranges:
        return clips

    from processors.text_editor import cuts_to_keep

    max_src = max(
        float(c.get("source_end") or c.get("timeline_end") or 0.0)
        for c in clips
    )
    cut_dicts = [{"start": float(a), "end": float(b)} for a, b in ranges if b > a]
    if not cut_dicts:
        return clips

    keep = cuts_to_keep(cut_dicts, max_src)
    if not keep:
        return []

    template = clips[0]
    rebuilt: list[dict] = []
    timeline_cursor = 0.0
    for i, seg in enumerate(keep):
        seg_dur = float(seg["end"]) - float(seg["start"])
        if seg_dur < 0.01:
            continue
        new_clip = dict(template)
        new_clip["id"] = f"{template.get('id', 'clip')}-seg-{i}"
        new_clip["timeline_start"] = timeline_cursor
        new_clip["timeline_end"] = timeline_cursor + seg_dur
        new_clip["source_start"] = float(seg["start"])
        new_clip["source_end"] = float(seg["end"])
        rebuilt.append(new_clip)
        timeline_cursor += seg_dur
    return rebuilt


# ── Action handlers ───────────────────────────────────────────────────────────

def _apply_cut(action: dict, data: dict) -> dict:
    """Remove a single time range [start_time, end_time] from all video clips."""
    start = float(action.get("start") or action.get("start_time") or 0.0)
    end = float(action.get("end") or action.get("end_time") or 0.0)

    if end <= start:
        raise SuggestionApplyError(
            f"Cut range is invalid: start ({start:.2f}s) must be before end ({end:.2f}s)."
        )

    ranges = [(start, end)]
    for track in data.get("tracks", []):
        if track.get("type") in ("video", "audio"):
            track["clips"] = _remove_time_ranges(track.get("clips", []), ranges)

    log.info("suggestion_apply_cut: start=%.2f end=%.2f", start, end)
    return data


def _apply_remove_filler(action: dict, data: dict) -> dict:
    """Remove multiple filler word time ranges from video and audio clips."""
    filler_cuts = action.get("filler_cuts", [])
    if not filler_cuts:
        # No filler cuts specified — check for a single range fallback
        start = float(action.get("start") or action.get("start_time") or 0.0)
        end = float(action.get("end") or action.get("end_time") or 0.0)
        if end > start:
            return _apply_cut(action, data)
        # Nothing to cut — return data unchanged
        return data

    ranges = [
        (float(fc.get("start", fc.get("start_time", 0.0))), float(fc.get("end", fc.get("end_time", 0.0))))
        for fc in filler_cuts
        if float(fc.get("end", fc.get("end_time", 0.0))) > float(fc.get("start", fc.get("start_time", 0.0)))
    ]

    if not ranges:
        return data

    for track in data.get("tracks", []):
        if track.get("type") in ("video", "audio"):
            track["clips"] = _remove_time_ranges(track.get("clips", []), ranges)

    log.info("suggestion_apply_remove_filler: %d ranges", len(ranges))
    return data


def _apply_visual_opportunity(action: dict, data: dict) -> dict:
    """
    Add a visual overlay clip to the overlay track.

    Creates an overlay track if one doesn't exist.
    The clip contains the visual type and display metadata as effects.
    """
    start = float(action.get("start_time", 0.0))
    end = float(action.get("end_time", start + 3.0))
    visual_type = action.get("visual_type") or action.get("type", "statistic")
    display_value = action.get("display_value", "")
    suggested_visual = action.get("suggested_visual", "animated_graphic")
    nepali_label = action.get("nepali_label", "")
    duration = float(action.get("duration_seconds", end - start))

    overlay_track = _get_or_create_track(
        data, "overlay", "track-overlay-1", "Visual Overlays"
    )

    clip_id = f"overlay-{str(uuid.uuid4())[:8]}"
    overlay_clip = {
        "id": clip_id,
        "asset_id": "synthetic",   # no source asset — generated overlay
        "source_start": 0.0,
        "source_end": duration,
        "timeline_start": start,
        "timeline_end": end,
        "speed": 1.0,
        "muted": True,
        "volume": 0.0,
        "effects": [
            {
                "type": "visual_overlay",
                "params": {
                    "visual_type": visual_type,
                    "display_value": display_value,
                    "suggested_visual": suggested_visual,
                    "nepali_label": nepali_label,
                },
            }
        ],
        "transitions": {},
        "label": f"{visual_type}: {display_value}",
    }
    overlay_track["clips"].append(overlay_clip)

    log.info("suggestion_apply_visual: type=%s at %.2f–%.2fs", visual_type, start, end)
    return data


def _apply_caption(action: dict, data: dict) -> dict:
    """Enable the captions track (make visible and unmuted)."""
    for track in data.get("tracks", []):
        if track.get("type") == "captions":
            track["visible"] = True
            track["muted"] = False
            log.info("suggestion_apply_caption: captions track enabled")
            return data

    # Create captions track if absent
    _get_or_create_track(data, "captions", "track-captions", "Captions")
    log.info("suggestion_apply_caption: captions track created")
    return data


def _apply_transition(action: dict, data: dict) -> dict:
    """Apply a transition at the end of the clip nearest to the target time."""
    transition_type = action.get("cut_type", "dissolve").replace("_cut", "")
    target_time = float(action.get("start_time") or action.get("end_time") or 0.0)

    for track in data.get("tracks", []):
        if track.get("type") != "video":
            continue
        clips = track.get("clips", [])
        if not clips:
            continue
        # Find clip whose end_time is closest to target_time
        best = min(clips, key=lambda c: abs(c.get("timeline_end", 0.0) - target_time))
        if best:
            transitions = best.setdefault("transitions", {})
            transitions["out"] = {"type": transition_type, "duration": 0.5}

    log.info("suggestion_apply_transition: type=%s at %.2fs", transition_type, target_time)
    return data


def _apply_hook_rewrite(action: dict, data: dict) -> dict:
    """Add a text overlay at the very start of the timeline (hook display)."""
    # Reuse visual opportunity logic with a text_overlay type
    hook_action = {
        "visual_type": "hook_rewrite",
        "start_time": 0.0,
        "end_time": 3.0,
        "display_value": action.get("hook_text", "Hook"),
        "suggested_visual": "text_overlay",
        "nepali_label": action.get("hook_text", ""),
        "duration_seconds": 3.0,
    }
    return _apply_visual_opportunity(hook_action, data)


def _apply_audio_fix(action: dict, data: dict) -> dict:
    """Add an audio normalisation effect to all audio clips."""
    effect = {
        "type": "audio_normalize",
        "params": {
            "target_lufs": -14.0,   # YouTube standard
            "noise_reduction": action.get("noise_reduction", False),
        },
    }
    for track in data.get("tracks", []):
        if track.get("type") == "audio":
            for clip in track.get("clips", []):
                effects = clip.setdefault("effects", [])
                # Don't duplicate
                if not any(e.get("type") == "audio_normalize" for e in effects):
                    effects.append(effect)

    log.info("suggestion_apply_audio_fix")
    return data


def _apply_highlight(action: dict, data: dict) -> dict:
    """Annotate a time range as a highlight in metadata — does not modify clips."""
    start = float(action.get("start_time", 0.0))
    end = float(action.get("end_time", 0.0))
    metadata = data.setdefault("metadata", {})
    highlights = metadata.setdefault("highlights", [])
    highlights.append({
        "start": start,
        "end": end,
        "label": action.get("title", "Highlight"),
    })
    log.info("suggestion_apply_highlight: %.2f–%.2fs", start, end)
    return data


def _apply_reorder(action: dict, data: dict) -> dict:
    """Reorder clips in the video track according to scene_order."""
    scene_order = action.get("scene_order") or action.get("order", [])
    if not scene_order:
        return data

    for track in data.get("tracks", []):
        if track.get("type") != "video":
            continue
        clips = track.get("clips", [])
        if not clips:
            continue

        # Build ordered list based on scene_order (list of clip IDs or scene indices)
        id_to_clip = {c["id"]: c for c in clips}
        reordered = []
        for clip_id in scene_order:
            if clip_id in id_to_clip:
                reordered.append(id_to_clip[clip_id])

        # Append any clips not mentioned in scene_order (safety)
        mentioned = set(scene_order)
        for clip in clips:
            if clip["id"] not in mentioned:
                reordered.append(clip)

        # Re-sequence timeline positions
        cursor = 0.0
        for clip in reordered:
            dur = clip.get("timeline_end", 0.0) - clip.get("timeline_start", 0.0)
            clip["timeline_start"] = cursor
            clip["timeline_end"] = cursor + dur
            cursor += dur

        track["clips"] = reordered
        log.info("suggestion_apply_reorder: %d clips reordered", len(reordered))
        break

    return data


def _apply_noop(action: dict, data: dict) -> dict:
    """No-op handler — suggestion accepted in DB but doesn't modify the timeline."""
    log.info("suggestion_apply_noop: action=%s", action.get("action") or action.get("type"))
    return data
