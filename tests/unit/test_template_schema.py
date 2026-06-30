"""
Unit tests for StyleTemplate v2 schema (Phase 01).

Run: pytest tests/unit/test_template_schema.py -v
"""
import os
import sys

import pytest
from pydantic import ValidationError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


class TestStyleTemplateSchema:
    def test_video_slot_requires_requirement_object(self):
        from schemas.template import StyleTemplate

        template = StyleTemplate(
            duration=10,
            aspect_ratio="9:16",
            slots=[
                {
                    "slot_id": "clip_1",
                    "type": "video_placeholder",
                    "start": 0,
                    "end": 3,
                    "label": "Hook",
                    "requirement": {
                        "shot_type": "talking_head",
                        "energy_level": "high_energy",
                        "min_duration": 2.5,
                        "max_duration": 3.5,
                        "needs_face": True,
                        "description": "Energetic close-up talking to camera",
                    },
                }
            ],
        )
        assert template.version == "2.1"
        assert template.slots[0].requirement is not None
        assert template.slots[0].requirement.shot_type == "talking_head"
        assert template.audio_profile.music_genre == "none"
        assert template.director_notes == []

    def test_legacy_music_mood_migrates_to_audio_profile(self):
        from schemas.template import StyleTemplate

        template = StyleTemplate(
            duration=10,
            aspect_ratio="9:16",
            music_mood="upbeat",
            slots=[],
        )
        assert template.audio_profile.music_genre == "upbeat"

    def test_audio_profile_and_director_notes(self):
        from schemas.template import AudioProfile, StyleTemplate

        template = StyleTemplate(
            duration=30,
            aspect_ratio="9:16",
            audio_profile=AudioProfile(
                music_genre="lofi hip-hop",
                music_energy_arc="calm with one peak",
                has_sfx_hits=True,
                sfx_style="subtle whoosh on transitions",
                music_ducking_behavior="music drops significantly under VO",
                voice_emotion_arc="starts calm, becomes urgent",
            ),
            director_notes=["0.0s-3.5s: Hook with high energy direct-to-camera"],
            slots=[],
        )
        assert template.version == "2.1"
        assert template.audio_profile.has_sfx_hits is True
        assert len(template.director_notes) == 1

    def test_text_overlay_slot_has_null_requirement(self):
        from schemas.template import TemplateSlot

        slot = TemplateSlot(
            slot_id="hook_text",
            type="text_overlay",
            start=0,
            end=2,
            label="Headline",
            requirement=None,
        )
        assert slot.requirement is None

    def test_invalid_pacing_rejected(self):
        from schemas.template import StyleTemplate

        with pytest.raises(ValidationError):
            StyleTemplate(duration=10, aspect_ratio="16:9", pacing="ultra")
