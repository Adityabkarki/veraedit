"""Tests for export timeline normalization helpers."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

from tasks.export_timeline import (
    caption_style_from_metadata,
    clip_cache_key,
    collect_render_clips,
    overlay_is_media_clip,
    overlay_layout,
    zoom_scale_at_time,
)


def test_clip_cache_key_prefers_storage_key():
    clip = {
        "id": "broll-1",
        "asset_id": "main-video",
        "effects": [{"type": "visual_overlay", "params": {"storage_key": "projects/p1/media/x.mp4"}}],
    }
    assert clip_cache_key(clip) == "projects/p1/media/x.mp4"


def test_overlay_layout_fullscreen_broll():
    clip = {
        "effects": [{
            "type": "visual_overlay",
            "params": {"overlay_mode": "fullscreen", "visual_type": "broll_overlay"},
        }],
    }
    layout = overlay_layout(clip, 1920, 1080)
    assert layout["mode"] == "fullscreen"
    assert layout["w"] == 1920


def test_overlay_layout_corner_positions_image():
    clip = {
        "effects": [{
            "type": "visual_overlay",
            "params": {"x_pct": 50, "y_pct": 50, "width_pct": 40, "height_pct": 30, "scale": 1},
        }],
    }
    layout = overlay_layout(clip, 1000, 800)
    assert layout["mode"] == "corner"
    assert layout["w"] == 400
    assert layout["h"] == 240


def test_collect_render_clips_includes_sfx_without_asset_id():
    timeline = {
        "tracks": [{
            "type": "audio",
            "clips": [{
                "id": "sfx-1",
                "asset_id": "clip-sfx-1",
                "timeline_start": 1.0,
                "timeline_end": 1.4,
                "effects": [{"type": "sfx_slot", "params": {"sfx_slug": "whoosh"}}],
            }],
        }],
    }
    clips = collect_render_clips(timeline, "audio")
    assert len(clips) == 1


def test_overlay_is_media_clip_skips_placeholder():
    clip = {
        "effects": [{"type": "visual_overlay", "params": {"is_placeholder": True, "visual_type": "statistic"}}],
    }
    assert overlay_is_media_clip(clip) is False


def test_caption_style_from_metadata_maps_position():
    meta = caption_style_from_metadata({
        "metadata": {
            "caption_style": {"position": "center", "font_size": "large", "bold": True},
        },
    })
    assert meta["position"] == "center"
    assert meta["fontsize"] == 72
    assert meta["bold"] == 1


def test_caption_style_user_color_overrides_template_preset():
    meta = caption_style_from_metadata({
        "metadata": {
            "caption_burn_style": "nepali_bold",
            "caption_style": {"color": "#FFFF00", "position": "bottom"},
        },
    })
    assert meta["primary_color"] == "&H0000FFFF"


def test_caption_style_from_timeline_track_style_when_metadata_missing():
    meta = caption_style_from_metadata({
        "metadata": {},
        "tracks": [{
            "type": "captions",
            "style": {"color": "#FFFF00", "position": "center", "font_size_vw": 6.0},
            "clips": [],
        }],
    })
    assert meta["primary_color"] == "&H0000FFFF"
    assert meta["position"] == "center"
    assert meta["fontsize"] >= 60


def test_caption_style_reads_caption_fx_from_effects_track():
    meta = caption_style_from_metadata({
        "metadata": {},
        "tracks": [{
            "type": "effects",
            "clips": [{
                "effects": [{
                    "type": "caption_style",
                    "params": {
                        "animation": "word-by-word",
                        "max_words_per_line": 2,
                        "position": "center",
                    },
                }],
            }],
        }],
    })
    assert meta["position"] == "center"
    assert meta["words_per_group"] == 2


def test_caption_style_sets_secondary_highlight_for_word_by_word_fx():
    meta = caption_style_from_metadata({
        "metadata": {
            "caption_style": {"color": "#FFFFFF"},
            "caption_fx": {"animation": "word-by-word"},
        },
    })
    assert meta["secondary_color"] == "&H000B9EF5"


def test_zoom_scale_reads_effects_track():
    timeline = {
        "tracks": [{
            "type": "effects",
            "clips": [{
                "timeline_start": 0.0,
                "timeline_end": 4.0,
                "effects": [{
                    "type": "keyframed_effect",
                    "params": {
                        "effect_type": "digital_zoom",
                        "preset_id": "digital_zoom_punch",
                        "keyframes": [{"offset": 0, "value": 1}, {"offset": 1, "value": 1.2}],
                    },
                }],
            }],
        }],
    }
    assert zoom_scale_at_time(timeline, 2.0) > 1.05
