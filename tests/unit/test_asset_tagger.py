"""
Unit tests for asset tagger (Phase 00).

Run: pytest tests/unit/test_asset_tagger.py -v
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


@pytest.mark.asyncio
async def test_tag_image_asset_without_api_key(monkeypatch, tmp_path):
    from processors import asset_tagger

    monkeypatch.setattr(asset_tagger.settings, "OPENAI_API_KEY", "")
    image = tmp_path / "test.jpg"
    image.write_bytes(b"\xff\xd8\xff\xd9")

    tags = await asset_tagger.tag_image_asset(image)
    assert tags["shot_type"] == "unknown"
    assert tags["tagging_confidence"] == 0.0
    assert "description" in tags


@pytest.mark.asyncio
async def test_tag_image_asset_with_mocked_vision(monkeypatch, tmp_path):
    from processors import asset_tagger

    image = tmp_path / "test.png"
    image.write_bytes(b"\x89PNG\r\n\x1a\n")

    async def fake_vision(content):
        return {
            "shot_type": "product_shot",
            "subject_count": 0,
            "has_face": False,
            "setting": "studio",
            "energy_level": "calm",
            "emotion": "neutral",
            "dominant_colors": ["#111111"],
            "aspect_ratio": "1:1",
            "is_landscape_orientation": False,
            "has_text_overlay": False,
            "description": "Product on white background.",
            "tagging_confidence": 0.88,
        }

    monkeypatch.setattr(asset_tagger.settings, "OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(asset_tagger, "_vision_tag", fake_vision)
    asset_tagger.budget.reset()

    tags = await asset_tagger.tag_image_asset(image)
    assert tags["shot_type"] == "product_shot"
    assert tags["description"] == "Product on white background."
    assert asset_tagger.budget.total_usd == pytest.approx(0.00015)


@pytest.mark.asyncio
async def test_tag_video_asset_with_mocked_frames(monkeypatch, tmp_path):
    from processors import asset_tagger

    video = tmp_path / "clip.mp4"
    video.write_bytes(b"not-a-real-video")

    monkeypatch.setattr(asset_tagger.settings, "OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(asset_tagger, "_sample_video_frames", lambda _p: (["abc"], 30.0))

    async def fake_vision(content):
        return {
            "shot_type": "talking_head",
            "subject_count": 1,
            "has_face": True,
            "setting": "indoor",
            "energy_level": "moderate",
            "emotion": "informative",
            "dominant_colors": ["#222222"],
            "aspect_ratio": "16:9",
            "is_landscape_orientation": True,
            "has_text_overlay": False,
            "description": "Person speaking to camera indoors.",
            "tagging_confidence": 0.9,
        }

    monkeypatch.setattr(asset_tagger, "_vision_tag", fake_vision)

    tags = await asset_tagger.tag_video_asset(video, "hello world")
    assert tags["shot_type"] == "talking_head"
    assert tags["duration_seconds"] == 30.0
    assert tags["has_spoken_audio"] is True
