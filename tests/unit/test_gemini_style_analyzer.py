"""
Unit tests for Gemini style analyzer helpers (Phase 01).

Run: pytest tests/unit/test_gemini_style_analyzer.py -v
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


class TestGeminiStyleAnalyzerHelpers:
    def test_convert_v1_to_v2_adds_requirements(self):
        from processors.gemini_style_analyzer import _convert_v1_to_v2

        v1 = {
            "version": "1.0",
            "duration": 15,
            "aspect_ratio": "9:16",
            "pacing": "fast",
            "visual_style": "bold",
            "color_palette": ["#111111"],
            "caption_style": {"position": "bottom_third"},
            "layers": [
                {
                    "type": "video_placeholder",
                    "slot": "clip_1",
                    "start": 0,
                    "end": 4,
                    "label": "Opening hook",
                },
                {
                    "type": "text_overlay",
                    "slot": "hook_text",
                    "start": 0,
                    "end": 3,
                    "label": "Headline",
                },
            ],
        }
        v2 = _convert_v1_to_v2(v1)
        assert v2["version"] == "2.0"
        assert len(v2["slots"]) == 2
        video_slot = v2["slots"][0]
        assert video_slot["requirement"]["shot_type"] == "talking_head"
        assert video_slot["requirement"]["energy_level"] == "high_energy"
        assert v2["slots"][1]["requirement"] is None

    def test_ensure_video_slot_requirements_fills_gaps(self):
        from processors.gemini_style_analyzer import _ensure_video_slot_requirements

        template = {
            "pacing": "slow",
            "slots": [
                {
                    "slot_id": "clip_1",
                    "type": "video_placeholder",
                    "start": 0,
                    "end": 5,
                    "label": "Main clip",
                }
            ],
        }
        out = _ensure_video_slot_requirements(template)
        req = out["slots"][0]["requirement"]
        assert req["energy_level"] == "calm"
        assert req["description"] == "Main clip"


@pytest.mark.asyncio
async def test_analyze_reference_video_frame_fallback(monkeypatch, tmp_path):
    from processors import gemini_style_analyzer

    video = tmp_path / "ref.mp4"
    video.write_bytes(b"fake")

    async def fake_fallback(path, project_id, *, source_url=None):
        return {
            "version": "2.0",
            "duration": 12,
            "aspect_ratio": "9:16",
            "color_palette": ["#000000"],
            "pacing": "medium",
            "visual_style": "ugc",
            "caption_style": {},
            "slots": [
                {
                    "slot_id": "clip_1",
                    "type": "video_placeholder",
                    "start": 0,
                    "end": 4,
                    "label": "Hook",
                    "requirement": {
                        "shot_type": "talking_head",
                        "energy_level": "moderate",
                        "min_duration": 3,
                        "max_duration": 5,
                        "needs_face": False,
                        "description": "Speaker intro",
                    },
                }
            ],
            "transitions": [],
        }

    monkeypatch.setattr(gemini_style_analyzer.settings, "GEMINI_API_KEY", "")
    monkeypatch.setattr(gemini_style_analyzer, "_analyze_with_frame_fallback", fake_fallback)

    result = await gemini_style_analyzer.analyze_reference_video(video, "proj-1")
    assert result["version"] == "2.0"
    assert result["slots"][0]["requirement"]["shot_type"] == "talking_head"
