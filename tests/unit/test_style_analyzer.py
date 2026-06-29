"""
Unit tests for style analyzer (Module 02).

Run: pytest tests/unit/test_style_analyzer.py -v
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


class TestBuildTemplate:
    def test_builds_video_placeholder_layers(self):
        from processors.style_analyzer import build_template

        style = {
            "estimated_clip_count": 2,
            "transitions": ["cut", "fade"],
            "caption_style": {"position": "bottom_third"},
            "text_overlays": [{"type": "hook", "style": "Bold opener"}],
            "pacing": "fast",
            "visual_style": "bold",
            "hook_style": "question",
            "has_background_music": True,
            "has_sound_effects": False,
        }
        meta = {"duration": 20.0, "width": 1080, "height": 1920}
        palette = ["#111111", "#ffffff"]
        template = build_template(style, meta, palette, [5.0, 10.0])

        assert template["duration"] == 20.0
        assert template["pacing"] == "fast"
        video_layers = [l for l in template["layers"] if l["type"] == "video_placeholder"]
        assert len(video_layers) == 2
        assert video_layers[0]["slot"] == "clip_1"
        assert any(l["type"] == "caption_track" for l in template["layers"])
        assert template["audio"]["background_music"] is True

    def test_aspect_ratio_reduced(self):
        from processors.style_analyzer import build_template

        template = build_template(
            {},
            {"duration": 10, "width": 1080, "height": 1920},
            [],
            [],
        )
        assert template["aspect_ratio"] == "9:16"


class TestExtractColorPalette:
    def test_none_frame_returns_defaults(self):
        from processors.style_analyzer import extract_color_palette

        colors = extract_color_palette(None)
        assert len(colors) >= 2
        assert all(c.startswith("#") for c in colors)


@pytest.mark.asyncio
async def test_analyze_video_style_without_gemini(monkeypatch, tmp_path):
    from processors import style_analyzer

    video = tmp_path / "test.mp4"
    video.write_bytes(b"not-a-real-video")

    monkeypatch.setattr(style_analyzer.settings, "GEMINI_API_KEY", "")
    monkeypatch.setattr(style_analyzer, "extract_key_frames", lambda _p: [])
    monkeypatch.setattr(style_analyzer, "detect_scene_cuts", lambda _p: [])
    monkeypatch.setattr(
        style_analyzer,
        "get_video_meta",
        lambda _p: {"duration": 15.0, "width": 1080, "height": 1920, "fps": 30.0},
    )

    result = await style_analyzer.analyze_video_style(video, "proj-1")
    assert result["project_id"] == "proj-1"
    assert "layers" in result
    assert result["duration"] == 15.0
