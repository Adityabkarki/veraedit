"""
Remove timeline artifacts from a previous style-template apply.

Re-applying a template must replace the last apply, not stack on top of it.
"""
from __future__ import annotations

from typing import Any


_STYLE_META_KEYS = (
    "edit_template",
    "pacing_target",
    "pacing_applied",
    "style_source",
    "content_formula",
)


def _effect_params(effect: dict[str, Any]) -> dict[str, Any]:
    params = effect.get("params")
    return params if isinstance(params, dict) else {}


def _clip_is_style_transfer(clip: dict[str, Any]) -> bool:
    clip_id = str(clip.get("id", ""))
    if clip_id.startswith(("recipe-", "style-", "sfx-style-", "music-bed-")):
        return True
    for effect in clip.get("effects") or []:
        if not isinstance(effect, dict):
            continue
        if _effect_params(effect).get("style_transfer"):
            return True
        if effect.get("type") in ("music_bed", "sfx_slot", "style_pacing"):
            return True
    return False


def _strip_video_clip_style(clip: dict[str, Any]) -> None:
    effects = clip.get("effects") or []
    kept: list[dict[str, Any]] = []
    for effect in effects:
        if not isinstance(effect, dict):
            kept.append(effect)
            continue
        etype = effect.get("type")
        params = _effect_params(effect)
        if etype in ("color_grade", "caption_style", "style_pacing"):
            continue
        if etype == "keyframed_effect" and params.get("style_transfer"):
            continue
        kept.append(effect)
    clip["effects"] = kept

    transitions = clip.get("transitions") or {}
    out = transitions.get("out")
    if isinstance(out, dict) and out.get("style_transfer"):
        transitions.pop("out", None)
    clip["transitions"] = transitions


def strip_prior_style_transfer(data: dict[str, Any]) -> dict[str, Any]:
    """Drop clips/effects/metadata written by RecipeApplicator or StyleApplicator."""
    meta = data.setdefault("metadata", {})
    for key in _STYLE_META_KEYS:
        meta.pop(key, None)

    for track in data.get("tracks", []):
        if not isinstance(track, dict):
            continue
        ttype = track.get("type")

        if ttype in ("overlay", "music", "audio"):
            track["clips"] = [
                c for c in track.get("clips", [])
                if isinstance(c, dict) and not _clip_is_style_transfer(c)
            ]
            continue

        if ttype == "video":
            for clip in track.get("clips", []):
                if isinstance(clip, dict):
                    _strip_video_clip_style(clip)
            continue

        if ttype == "captions":
            style = track.get("style")
            if isinstance(style, dict) and style.get("style_transfer"):
                track.pop("style", None)
            for clip in track.get("clips", []):
                if not isinstance(clip, dict):
                    continue
                clip["effects"] = [
                    e for e in clip.get("effects", [])
                    if not (isinstance(e, dict) and e.get("type") == "caption_style")
                ]

    return data
