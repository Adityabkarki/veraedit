"""
Timeline pacing operations for style-transfer apply.

Applies the *edit formula* (cut rhythm, silence tolerance, jump-cut structure)
to the user's footage — never copies reference media or text.
"""
from __future__ import annotations

import copy
import uuid
from typing import Any

from tasks.audio_intel import (
    analyze_audio_intelligence,
    plan_filler_cuts,
)


def mark_pacing_clip(clip: dict) -> dict:
    effects = clip.setdefault("effects", [])
    effects[:] = [e for e in effects if e.get("type") != "style_pacing"]
    effects.append({
        "type": "style_pacing",
        "params": {"style_transfer": True, "jump_cut": True},
    })
    return clip


def split_clip_for_pacing(
    clip: dict, target_sec: float, strength: float,
) -> list[dict]:
    tl_start = float(clip["timeline_start"])
    tl_end = float(clip["timeline_end"])
    duration = tl_end - tl_start
    src_start = float(clip.get("source_start", tl_start))
    src_end = float(clip.get("source_end", tl_end))
    src_duration = src_end - src_start

    if duration <= 0.01:
        return [mark_pacing_clip(copy.deepcopy(clip))]

    if duration <= target_sec * 1.25:
        return [mark_pacing_clip(copy.deepcopy(clip))]

    num_segments_ideal = duration / target_sec
    max_segs = max(2, round(num_segments_ideal))
    n_segs = max(1, round(1 + (max_segs - 1) * strength))
    n_segs = min(n_segs, max(1, int(duration / 0.5)))
    seg_sec = duration / n_segs

    if n_segs <= 1 or duration <= seg_sec * 1.2:
        return [mark_pacing_clip(copy.deepcopy(clip))]

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
        seg["id"] = f"clip-{uuid.uuid4().hex[:12]}"
        seg["timeline_start"] = round(cursor_tl, 4)
        seg["timeline_end"] = round(cursor_tl + seg_dur, 4)
        seg["source_start"] = round(cursor_src, 4)
        seg["source_end"] = round(cursor_src + seg_dur * src_per_tl, 4)
        if idx > 0 or not clip.get("label"):
            seg["label"] = f"Cut {idx + 1}"
        segments.append(mark_pacing_clip(seg))
        cursor_tl += seg_dur
        cursor_src += seg_dur * src_per_tl

    if segments and segments[-1]["timeline_end"] < tl_end - 0.01:
        segments[-1]["timeline_end"] = round(tl_end, 4)
        segments[-1]["source_end"] = round(src_end, 4)

    return segments or [mark_pacing_clip(copy.deepcopy(clip))]


def sync_audio_to_video_splits(data: dict) -> None:
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
            aclip["id"] = f"clip-{uuid.uuid4().hex[:12]}"
            aclip["timeline_start"] = vclip["timeline_start"]
            aclip["timeline_end"] = vclip["timeline_end"]
            aclip["source_start"] = vclip.get("source_start", vclip["timeline_start"])
            aclip["source_end"] = vclip.get("source_end", vclip["timeline_end"])
            new_audio.append(aclip)
        track["clips"] = new_audio


def _merge_ranges(ranges: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if not ranges:
        return []
    sorted_r = sorted(ranges, key=lambda x: x[0])
    merged: list[tuple[float, float]] = [sorted_r[0]]
    for start, end in sorted_r[1:]:
        prev_s, prev_e = merged[-1]
        if start <= prev_e:
            merged[-1] = (prev_s, max(prev_e, end))
        else:
            merged.append((start, end))
    return merged


def remap_time_after_removals(t: float, removed: list[tuple[float, float]]) -> float:
    """Map a timeline second from pre-removal space to post-removal space."""
    if not removed:
        return t
    offset = 0.0
    for start, end in removed:
        if t >= end:
            offset += end - start
        elif t > start:
            return max(0.0, start - offset)
    return max(0.0, t - offset)


def ripple_remove_time_ranges(
    data: dict,
    ranges: list[tuple[float, float]],
    track_types: frozenset[str] = frozenset({"video", "audio", "captions", "overlay"}),
) -> list[tuple[float, float]]:
    """
    Remove time ranges from timeline clips and shift later content left.
    Returns merged ranges actually applied.
    """
    merged = _merge_ranges(ranges)
    if not merged:
        return []

    for start, end in reversed(merged):
        dur = end - start
        for track in data.get("tracks", []):
            if track.get("type") not in track_types:
                continue
            new_clips: list[dict] = []
            for clip in track.get("clips", []):
                cs = float(clip["timeline_start"])
                ce = float(clip["timeline_end"])
                tl_dur = max(ce - cs, 0.001)
                src_start = float(clip.get("source_start", cs))
                src_end = float(clip.get("source_end", ce))
                src_per_tl = (src_end - src_start) / tl_dur

                if ce <= start or cs >= end:
                    out = copy.deepcopy(clip)
                    if cs >= end:
                        out["timeline_start"] = round(cs - dur, 4)
                        out["timeline_end"] = round(ce - dur, 4)
                    new_clips.append(out)
                    continue

                if cs >= start and ce <= end:
                    continue

                if cs < start and ce > end:
                    left = copy.deepcopy(clip)
                    left["id"] = f"clip-{uuid.uuid4().hex[:12]}"
                    left["timeline_end"] = round(start, 4)
                    left["source_end"] = round(
                        src_start + (start - cs) * src_per_tl, 4,
                    )
                    right = copy.deepcopy(clip)
                    right["id"] = f"clip-{uuid.uuid4().hex[:12]}"
                    right["timeline_start"] = round(end - dur, 4)
                    right["timeline_end"] = round(ce - dur, 4)
                    right["source_start"] = round(
                        src_start + (end - cs) * src_per_tl, 4,
                    )
                    # Tail segment: source maps from timeline `end` through `ce` (not from `cs`).
                    right["source_end"] = round(
                        src_start + (ce - cs) * src_per_tl, 4,
                    )
                    if float(left["timeline_end"]) - float(left["timeline_start"]) > 0.08:
                        new_clips.append(left)
                    if float(right["timeline_end"]) - float(right["timeline_start"]) > 0.08:
                        new_clips.append(right)
                    continue

                if cs < start and ce <= end:
                    out = copy.deepcopy(clip)
                    out["timeline_end"] = round(start, 4)
                    out["source_end"] = round(src_start + (start - cs) * src_per_tl, 4)
                    if float(out["timeline_end"]) - float(out["timeline_start"]) > 0.08:
                        new_clips.append(out)
                    continue

                if cs >= start and ce > end:
                    out = copy.deepcopy(clip)
                    out["timeline_start"] = round(end - dur, 4)
                    out["timeline_end"] = round(ce - dur, 4)
                    out["source_start"] = round(src_start + (end - cs) * src_per_tl, 4)
                    if float(out["timeline_end"]) - float(out["timeline_start"]) > 0.08:
                        new_clips.append(out)
                    continue

            track["clips"] = new_clips

    gs = data.setdefault("global_settings", {})
    max_end = 0.0
    for track in data.get("tracks", []):
        for clip in track.get("clips", []):
            max_end = max(max_end, float(clip.get("timeline_end", 0)))
    gs["duration"] = max(max_end, 0.5)
    return merged


def plan_aggressive_silence_cuts(
    words: list[dict[str, Any]],
    total_duration: float,
    min_gap_s: float,
    strength: float,
) -> list[tuple[float, float]]:
    """Silence gaps to remove for jump-cut Shorts pacing."""
    if not words or min_gap_s <= 0:
        return []
    sorted_words = sorted(words, key=lambda w: float(w.get("start", 0)))
    cuts: list[tuple[float, float]] = []
    keep = max(0.02, 0.08 * (1.0 - strength))
    for i in range(len(sorted_words) - 1):
        w_end = float(sorted_words[i].get("end", 0))
        n_start = float(sorted_words[i + 1].get("start", w_end))
        gap = n_start - w_end
        if gap < min_gap_s:
            continue
        cut_start = w_end + keep
        cut_end = n_start - keep
        if cut_end > cut_start + 0.02:
            cuts.append((cut_start, cut_end))
    if total_duration > 0 and strength >= 0.6:
        max_remove = total_duration * 0.35 * strength
        total = sum(e - s for s, e in cuts)
        if total > max_remove and cuts:
            scale = max_remove / total
            cuts = [
                (s, s + (e - s) * scale)
                for s, e in cuts
            ]
    return cuts


def apply_jump_cut_formula(
    data: dict,
    *,
    avg_cut_duration_ms: float,
    silence_tolerance_ms: float,
    strength: float,
    transcript_words: list[dict[str, Any]] | None = None,
    remove_filler: bool = False,
) -> dict[str, Any]:
    """
    Split long takes into jump-cut segments and optionally tighten silences/fillers.
    Returns pacing_applied metadata.
    """
    target_sec = max(0.4, avg_cut_duration_ms / 1000.0)
    clips_before = 0
    clips_after = 0
    removed_ranges: list[tuple[float, float]] = []

    if strength >= 0.45 and transcript_words:
        total_dur = float(data.get("global_settings", {}).get("duration", 0))
        if total_dur <= 0:
            for track in data.get("tracks", []):
                for clip in track.get("clips", []):
                    total_dur = max(total_dur, float(clip.get("timeline_end", 0)))
        min_gap = max(0.12, silence_tolerance_ms / 1000.0)
        silence_ranges = plan_aggressive_silence_cuts(
            transcript_words, total_dur, min_gap, strength,
        )
        if remove_filler and strength >= 0.55:
            report = analyze_audio_intelligence(transcript_words, total_dur)
            for cut in plan_filler_cuts(report):
                silence_ranges.append((cut["start"], cut["end"]))
        if silence_ranges:
            removed_ranges = ripple_remove_time_ranges(data, silence_ranges)

    for track in data.get("tracks", []):
        if track.get("type") != "video":
            continue
        clips_before = len(track.get("clips", []))
        new_clips: list[dict] = []
        for clip in track.get("clips", []):
            new_clips.extend(split_clip_for_pacing(clip, target_sec, strength))
        track["clips"] = new_clips
        clips_after = len(new_clips)

    sync_audio_to_video_splits(data)

    return {
        "mode": "jump_cut_formula",
        "target_cut_ms": avg_cut_duration_ms,
        "clips_before": clips_before,
        "clips_after": clips_after,
        "strength": strength,
        "silence_ranges_removed": len(removed_ranges),
        "seconds_removed": round(sum(e - s for s, e in removed_ranges), 2),
        "removed_ranges": [
            {"start": round(s, 3), "end": round(e, 3)}
            for s, e in removed_ranges[:40]
        ],
    }


def _sfx_audio_tracks(data: dict) -> list[dict]:
  return [
      t
      for t in data.get("tracks", [])
      if t.get("type") == "audio" and "sfx" in str(t.get("name", "")).lower()
  ]


def _clip_overlaps_range(clip: dict, start: float, end: float) -> bool:
    cs = float(clip.get("timeline_start", 0))
    ce = float(clip.get("timeline_end", cs))
    return start < ce and end > cs


def ensure_sfx_audio_track(data: dict, at_s: float, duration: float) -> dict:
    """Dedicated SFX audio lane; stacks a new layer when clips overlap."""
    sfx_tracks = _sfx_audio_tracks(data)
    if not sfx_tracks:
        track = {
            "id": "track-sfx-1",
            "type": "audio",
            "name": "SFX",
            "muted": False,
            "locked": False,
            "visible": True,
            "clips": [],
        }
        data.setdefault("tracks", []).append(track)
        return track

    start = max(0.0, at_s)
    end = start + duration
    for track in sfx_tracks:
        busy = any(_clip_overlaps_range(c, start, end) for c in track.get("clips", []))
        if not busy:
            return track

    layer = len(sfx_tracks) + 1
    track = {
        "id": f"track-sfx-{layer}",
        "type": "audio",
        "name": f"SFX {layer}",
        "muted": False,
        "locked": False,
        "visible": True,
        "clips": [],
    }
    data.setdefault("tracks", []).append(track)
    return track


_SFX_SLUG_BY_TYPE: dict[str, str] = {
    "whoosh": "whoosh",
    "swish": "whoosh_arrow",
    "click": "shutter_click",
    "shutter_click": "shutter_click",
    "sub_bass": "sub_bass",
    "sub_bass_thud": "sub_bass",
    "impact_hit": "impact_hit",
    "pop": "pop",
    "swipe": "swipe",
    "glitch": "glitch",
    "riser": "riser",
    "notification": "notification",
}


def add_sfx_timeline_clip(
    data: dict,
    at_s: float,
    sfx_type: str = "whoosh",
    volume: float = 0.35,
) -> None:
    """SFX clip on a dedicated audio lane (bundled Mixkit MP3 via sfx_slug)."""
    dur = 0.15 if sfx_type in ("click", "shutter_click") else 0.32 if sfx_type.startswith("sub_bass") else 0.35
    label = {
        "whoosh": "Whoosh",
        "click": "Shutter",
        "shutter_click": "Shutter",
        "swish": "Swish",
        "sub_bass": "Sub bass",
        "sub_bass_thud": "Sub bass",
        "impact_hit": "Impact",
        "pop": "Pop",
        "swipe": "Swipe",
        "glitch": "Glitch",
        "riser": "Riser",
        "notification": "Ding",
    }.get(sfx_type, sfx_type.replace("_", " ").title())
    sfx_slug = _SFX_SLUG_BY_TYPE.get(sfx_type, sfx_type if sfx_type in _SFX_SLUG_BY_TYPE.values() else "whoosh")
    track = ensure_sfx_audio_track(data, at_s, dur)
    track["clips"].append({
        "id": f"sfx-{uuid.uuid4().hex[:8]}",
        "asset_id": "synthetic",
        "source_start": 0.0,
        "source_end": dur,
        "timeline_start": round(max(0.0, at_s), 4),
        "timeline_end": round(max(0.0, at_s) + dur, 4),
        "speed": 1.0,
        "muted": False,
        "volume": volume,
        "effects": [{
            "type": "sfx_slot",
            "params": {
                "sfx_type": sfx_type,
                "sfx_slug": sfx_slug,
                "volume": volume,
                "style_transfer": True,
                "is_placeholder": False,
                "slot_label": f"SFX: {label}",
            },
        }],
        "transitions": {},
        "label": f"SFX: {label}",
    })


def add_music_bed_timeline_clip(
    data: dict,
    duration_s: float,
    params: dict[str, Any],
    strength: float,
) -> None:
    """Full-span music placeholder on the music track."""
    for track in data.get("tracks", []):
        if track.get("type") == "music":
            break
    else:
        track = {
            "id": "track-music-style",
            "type": "music",
            "name": "Music",
            "muted": False,
            "locked": False,
            "visible": True,
            "clips": [],
            "style": {},
        }
        data.setdefault("tracks", []).append(track)

    music_track = next(t for t in data["tracks"] if t["type"] == "music")
    style = {
        "energy": params.get("music_energy", "medium"),
        "ducking": params.get("ducking", "moderate"),
        "genre_hint": params.get("genre_hint", "upbeat"),
        "volume": round(0.22 * strength, 3),
        "style_transfer": True,
    }
    music_track["style"] = {**music_track.get("style", {}), **style}
    music_track["clips"] = [
        c for c in music_track.get("clips", [])
        if not any(
            e.get("type") == "music_bed"
            for e in c.get("effects", [])
        )
    ]
    dur = max(1.0, duration_s)
    music_track["clips"].append({
        "id": f"music-bed-{uuid.uuid4().hex[:8]}",
        "asset_id": "synthetic",
        "source_start": 0.0,
        "source_end": dur,
        "timeline_start": 0.0,
        "timeline_end": round(dur, 4),
        "speed": 1.0,
        "muted": False,
        "volume": style["volume"],
        "effects": [{
            "type": "music_bed",
            "params": {
                **style,
                "style_transfer": True,
                "is_placeholder": True,
                "slot_label": "Add your background music track",
            },
        }],
        "transitions": {},
        "label": "Music bed (add track)",
    })


def add_resolved_music_bed_clip(
    data: dict,
    duration_s: float,
    *,
    asset_id: str,
    storage_key: str,
    volume: float,
    duck_under_voice: bool,
    label: str,
    mood: str,
    track_filename: str,
) -> None:
    """Full-span music clip backed by a real bundled track in MinIO."""
    for track in data.get("tracks", []):
        if track.get("type") == "music":
            break
    else:
        track = {
            "id": "track-music-style",
            "type": "music",
            "name": "Music",
            "muted": False,
            "locked": False,
            "visible": True,
            "clips": [],
            "style": {},
        }
        data.setdefault("tracks", []).append(track)

    music_track = next(t for t in data["tracks"] if t["type"] == "music")
    music_track["clips"] = [
        c for c in music_track.get("clips", [])
        if not any(e.get("type") == "music_bed" for e in c.get("effects", []))
    ]
    dur = max(1.0, duration_s)
    music_track["style"] = {
        **music_track.get("style", {}),
        "energy": mood,
        "volume": volume,
        "style_transfer": True,
    }
    music_track["clips"].append({
        "id": f"music-bed-{uuid.uuid4().hex[:8]}",
        "asset_id": asset_id,
        "source_start": 0.0,
        "source_end": dur,
        "timeline_start": 0.0,
        "timeline_end": round(dur, 4),
        "speed": 1.0,
        "muted": False,
        "volume": volume,
        "effects": [{
            "type": "music_bed",
            "params": {
                "style_transfer": True,
                "is_placeholder": False,
                "storage_key": storage_key,
                "track_filename": track_filename,
                "mood": mood,
                "duck_under_voice": duck_under_voice,
                "slot_label": label,
            },
        }],
        "transitions": {},
        "label": label,
    })
