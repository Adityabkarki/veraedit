"""
Normalize editor timeline JSON for FFmpeg export.

Bridges the gap between preview-layer clip effects and the render worker.
"""
from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger("viraedit.tasks.export_timeline")


def clip_effects_by_type(clip: dict, etype: str) -> list[dict]:
    effects = clip.get("effects") or []
    return [e for e in effects if isinstance(e, dict) and e.get("type") == etype]


def clip_effect_param(clip: dict, effect_type: str, param: str) -> Any:
    for effect in clip.get("effects", []):
        if effect.get("type") == effect_type:
            params = effect.get("params") or {}
            if param in params:
                return params[param]
    return None


def clip_cache_key(clip: dict) -> str:
    """Stable download-cache key for a clip's media source."""
    for effect in clip.get("effects", []):
        params = (effect.get("params") or {}) if isinstance(effect, dict) else {}
        key = params.get("storage_key")
        if key:
            return str(key)
    asset_id = str(clip.get("asset_id", "") or "")
    if asset_id and not asset_id.startswith("clip-"):
        return asset_id
    return str(clip.get("id", ""))


def clip_has_render_source(clip: dict) -> bool:
    """True when the clip references downloadable media for export."""
    if clip_effect_param(clip, "visual_overlay", "storage_key"):
        return True
    if clip_effect_param(clip, "music_bed", "storage_key"):
        return True
    if clip_effect_param(clip, "sfx_slot", "sfx_slug"):
        return True
    asset_id = str(clip.get("asset_id", "") or "")
    if asset_id and not asset_id.startswith("clip-"):
        return True
    media_url = clip_effect_param(clip, "visual_overlay", "media_url")
    if media_url and str(media_url).startswith(("http://", "https://")):
        return True
    music_url = clip_effect_param(clip, "music_bed", "media_url")
    if music_url and str(music_url).startswith(("http://", "https://")):
        return True
    return False


def collect_render_clips(timeline_data: dict, *track_types: str) -> list[dict]:
    """Collect clips from matching tracks that have a renderable source."""
    clips: list[dict] = []
    for track in timeline_data.get("tracks", []):
        ttype = (track.get("type") or "").lower()
        if ttype not in track_types:
            continue
        for clip in track.get("clips") or []:
            if not isinstance(clip, dict):
                continue
            if clip_has_render_source(clip) or ttype in ("video", "captions", "effects"):
                clips.append(clip)
    clips.sort(key=lambda c: float(c.get("timeline_start", 0.0)))
    return clips


def overlay_layout(clip: dict, width: int, height: int) -> dict[str, Any]:
    """Map visual_overlay params → FFmpeg overlay geometry."""
    params: dict[str, Any] = {}
    for eff in clip_effects_by_type(clip, "visual_overlay"):
        params.update(eff.get("params") or {})

    mode = str(params.get("overlay_mode") or "").lower()
    broll_type = params.get("broll_type")
    visual_type = str(params.get("visual_type") or "").lower()
    if mode == "fullscreen" or broll_type or visual_type in (
        "broll_overlay", "broll_insert", "broll_cutaway", "screen_recording",
    ):
        return {"mode": "fullscreen", "x": 0, "y": 0, "w": width, "h": height, "opacity": 1.0}

    x_pct = float(params.get("x_pct", 50))
    y_pct = float(params.get("y_pct", 50))
    w_pct = float(params.get("width_pct", 30))
    h_pct = float(params.get("height_pct", 30))
    scale = float(params.get("scale", 1.0))
    opacity = float(params.get("image_opacity", 100)) / 100.0

    ow = max(16, int(width * w_pct / 100.0 * scale))
    oh = max(16, int(height * h_pct / 100.0 * scale))
    x = int(width * x_pct / 100.0 - ow / 2)
    y = int(height * y_pct / 100.0 - oh / 2)

    return {
        "mode": "corner",
        "x": max(0, min(width - ow, x)),
        "y": max(0, min(height - oh, y)),
        "w": ow,
        "h": oh,
        "opacity": max(0.0, min(1.0, opacity)),
    }


def overlay_is_media_clip(clip: dict) -> bool:
    """Skip text-only overlays that have no media file."""
    params: dict[str, Any] = {}
    for eff in clip_effects_by_type(clip, "visual_overlay"):
        params.update(eff.get("params") or {})
    if params.get("is_placeholder"):
        return False
    if params.get("storage_key") or params.get("media_url"):
        return True
    visual = str(params.get("visual_type") or "").lower()
    return visual in (
        "broll_overlay", "broll_insert", "image_slot", "image_sticker",
        "image_shape", "screen_recording",
    )


def interpolate_keyframes(keyframes: list[dict], local_time: float, fallback: float = 1.0) -> float:
    if not keyframes:
        return fallback
    sorted_kf = sorted(keyframes, key=lambda k: float(k.get("offset", 0)))
    if local_time <= float(sorted_kf[0].get("offset", 0)):
        return float(sorted_kf[0].get("value", fallback))
    last = sorted_kf[-1]
    if local_time >= float(last.get("offset", 0)):
        return float(last.get("value", fallback))
    for i in range(len(sorted_kf) - 1):
        a, b = sorted_kf[i], sorted_kf[i + 1]
        t0, t1 = float(a.get("offset", 0)), float(b.get("offset", 0))
        if t0 <= local_time <= t1:
            span = t1 - t0
            if span <= 0:
                return float(b.get("value", fallback))
            t = (local_time - t0) / span
            v0, v1 = float(a.get("value", fallback)), float(b.get("value", fallback))
            return v0 + t * (v1 - v0)
    return float(last.get("value", fallback))


def zoom_scale_at_time(timeline_data: dict, time_s: float) -> float:
    """Match preview zoom from Effects / Camera track keyframes."""
    best = 1.0
    for track in timeline_data.get("tracks", []):
        if (track.get("type") or "").lower() != "effects":
            continue
        for clip in track.get("clips") or []:
            start = float(clip.get("timeline_start", 0))
            end = float(clip.get("timeline_end", start))
            if time_s < start or time_s >= end:
                continue
            for eff in clip_effects_by_type(clip, "keyframed_effect"):
                params = eff.get("params") or {}
                effect_type = str(params.get("effect_type") or "")
                preset = str(params.get("preset_id") or "")
                if effect_type not in ("digital_zoom", "transform") and preset not in (
                    "digital_zoom_punch", "ken_burns",
                ):
                    continue
                keyframes = params.get("keyframes") or []
                local = time_s - start
                duration = max(end - start, 0.01)
                if keyframes and all(float(k.get("offset", 0)) <= 1.5 for k in keyframes):
                    local = local / duration
                easing = str(params.get("zoom_easing") or "linear")
                scale = interpolate_keyframes(keyframes, local, 1.0)
                if easing == "ease-out" and keyframes:
                    # Approximate ease-out by biasing toward end value
                    scale = 1.0 + (scale - 1.0) * min(1.0, local * 1.2)
                best = max(best, scale)
    return best


def caption_style_from_metadata(timeline_data: dict) -> dict[str, Any]:
    """
    Build ASS burn-in overrides from saved export metadata.

    User editor choices (color, position, font) override template/DNA presets.
    Preview fidelity takes priority over style-transfer defaults.
    """
    from processors.caption_renderer import css_color_to_ass

    meta = timeline_data.get("metadata") or {}
    style = meta.get("caption_style") or {}
    if not isinstance(style, dict):
        style = {}
    timeline_caption_style: dict[str, Any] = {}
    for track in timeline_data.get("tracks", []):
        ttype = (track.get("type") or "").lower()
        if ttype == "captions":
            track_style = track.get("style")
            if isinstance(track_style, dict):
                timeline_caption_style.update(track_style)
        if ttype not in ("captions", "effects"):
            continue
        for clip in track.get("clips") or []:
            for eff in clip.get("effects") or []:
                if isinstance(eff, dict) and eff.get("type") == "caption_style":
                    params = eff.get("params")
                    if isinstance(params, dict):
                        timeline_caption_style.update(params)

    position_map = {
        "bottom": "bottom_third",
        "center": "center",
        "top": "top",
    }
    fontsize_map = {
        "small": 52,
        "medium": 60,
        "large": 72,
        "xl": 80,
    }

    overrides: dict[str, Any] = {}

    # Position — caption FX and caption-style track values can override metadata.
    fx = meta.get("caption_fx")
    position_src = style.get("position") or timeline_caption_style.get("position")
    if isinstance(fx, dict) and fx.get("position"):
        position_src = fx.get("position")
    if position_src:
        overrides["position"] = position_map.get(str(position_src), "bottom_third")

    font_size = style.get("font_size")
    if not font_size and timeline_caption_style.get("font_size_vw") is not None:
        try:
            vw = float(timeline_caption_style.get("font_size_vw"))
            overrides["fontsize"] = max(32, int(round(vw * 10.8)))
        except (TypeError, ValueError):
            pass
    elif font_size:
        overrides["fontsize"] = fontsize_map.get(str(font_size), 68)
    if style.get("bold") is not None:
        overrides["bold"] = 1 if style.get("bold") else 0
    elif str(timeline_caption_style.get("case", "")).lower() == "uppercase":
        overrides["bold"] = 1
    if style.get("use_nepali_font"):
        overrides["use_devanagari"] = True

    # User-chosen text color (e.g. yellow #FFFF00) — must beat template preset.
    color_src = style.get("color") or timeline_caption_style.get("color")
    if color_src:
        overrides["primary_color"] = css_color_to_ass(str(color_src))
    # Word-by-word preview uses orange active-word highlighting.
    # Export maps this to ASS SecondaryColour so karaoke timing matches preview.
    highlight_src = style.get("highlight_color") or timeline_caption_style.get("highlight_color")
    highlight_from_fx = False
    if isinstance(fx, dict):
        anim = str(fx.get("animation") or "").lower()
        if anim in ("word-by-word", "scale_pop", "masked_reveal"):
            highlight_from_fx = True
    if highlight_src:
        overrides["secondary_color"] = css_color_to_ass(str(highlight_src), "&H000B9EF5")
    elif highlight_from_fx:
        # Mirror frontend accent heuristic:
        # yellow text => amber highlight, otherwise orange.
        base_color = str(color_src or "").strip().lower()
        if base_color in ("#ffff00", "rgb(255,255,0)", "rgba(255,255,0,1)"):
            overrides["secondary_color"] = css_color_to_ass("#FBBF24", "&H0024BFFB")
        else:
            overrides["secondary_color"] = css_color_to_ass("#F59E0B", "&H000B9EF5")

    if style.get("background_color"):
        bg = str(style["background_color"])
        overrides["back_color"] = css_color_to_ass(bg, "&H80000000")
        overrides["border_style"] = 3

    if isinstance(fx, dict):
        if fx.get("max_words_per_line"):
            overrides["words_per_group"] = int(fx["max_words_per_line"])
    elif timeline_caption_style.get("max_words_per_line"):
        overrides["words_per_group"] = int(timeline_caption_style["max_words_per_line"])

    if isinstance(fx, dict):
        if fx.get("caption_case") == "uppercase":
            overrides["bold"] = 1
    elif str(timeline_caption_style.get("case", "")).lower() == "uppercase":
        overrides["bold"] = 1

    return overrides


def log_caption_preview_vs_render(timeline_data: dict, resolved_overrides: dict[str, Any]) -> None:
    """Debug log: compare editor caption_style metadata vs resolved ASS overrides."""
    meta = timeline_data.get("metadata") or {}
    preview = meta.get("caption_style") or {}
    fx = meta.get("caption_fx")
    log.info(
        "caption_preview_vs_render: preview_color=%s preview_position=%s preview_preset=%s "
        "fx=%s render_primary=%s render_position=%s burn_style=%s",
        preview.get("color") if isinstance(preview, dict) else None,
        preview.get("position") if isinstance(preview, dict) else None,
        meta.get("caption_editor_preset"),
        fx,
        resolved_overrides.get("primary_color"),
        resolved_overrides.get("position"),
        meta.get("caption_burn_style"),
    )


def log_render_plan(timeline_data: dict) -> None:
    """Log a concise summary of what the export worker will render."""
    video = collect_render_clips(timeline_data, "video")
    music = collect_render_clips(timeline_data, "music")
    audio = collect_render_clips(timeline_data, "audio")
    overlay = [c for c in collect_render_clips(timeline_data, "overlay") if overlay_is_media_clip(c)]
    captions = collect_render_clips(timeline_data, "captions")
    effects = collect_render_clips(timeline_data, "effects")

    meta = timeline_data.get("metadata") or {}
    log.info(
        "render_plan: video=%d music=%d audio=%d media_overlays=%d "
        "caption_clips=%d effect_clips=%d burn_style=%s preset=%s caption_color=%s",
        len(video),
        len(music),
        len(audio),
        len(overlay),
        len(captions),
        len(effects),
        meta.get("caption_burn_style", "?"),
        meta.get("caption_editor_preset", "?"),
        (meta.get("caption_style") or {}).get("color") if isinstance(meta.get("caption_style"), dict) else None,
    )

    for clip in overlay[:8]:
        layout = overlay_layout(clip, 1920, 1080)
        log.info(
            "render_plan_overlay: id=%s start=%.2fs mode=%s key=%s",
            clip.get("id"),
            float(clip.get("timeline_start", 0)),
            layout.get("mode"),
            clip_cache_key(clip),
        )


def http_media_url(clip: dict) -> str | None:
    """Return an http(s) media URL from clip effects, if any."""
    for etype in ("visual_overlay", "music_bed"):
        url = clip_effect_param(clip, etype, "media_url")
        if url and str(url).startswith(("http://", "https://")):
            return str(url)
    return None


def sfx_slug_from_clip(clip: dict) -> str | None:
    slug = clip_effect_param(clip, "sfx_slot", "sfx_slug")
    if slug:
        return str(slug)
    sfx_type = clip_effect_param(clip, "sfx_slot", "sfx_type")
    if sfx_type:
        return str(sfx_type).lower().replace(" ", "_")
    return None
