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
        assert template.version == "2.0"
        assert template.slots[0].requirement is not None
        assert template.slots[0].requirement.shot_type == "talking_head"

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
