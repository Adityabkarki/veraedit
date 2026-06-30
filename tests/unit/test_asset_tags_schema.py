"""
Unit tests for AssetTags schema (Phase 00).

Run: pytest tests/unit/test_asset_tags_schema.py -v
"""
import os
import sys

import pytest
from pydantic import ValidationError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


class TestAssetTags:
    def test_valid_defaults(self):
        from schemas.asset_tags import AssetTags

        tags = AssetTags()
        assert tags.shot_type == "unknown"
        assert tags.tagging_confidence == 0.0

    def test_valid_full_payload(self):
        from schemas.asset_tags import AssetTags

        tags = AssetTags(
            shot_type="talking_head",
            subject_count=1,
            has_face=True,
            setting="studio",
            energy_level="high_energy",
            emotion="excited",
            dominant_colors=["#ff0000", "#00ff00"],
            aspect_ratio="9:16",
            is_landscape_orientation=False,
            has_text_overlay=True,
            has_spoken_audio=True,
            duration_seconds=12.5,
            description="Energetic host in a studio setup.",
            tagging_confidence=0.92,
        )
        assert tags.shot_type == "talking_head"
        assert tags.duration_seconds == 12.5

    def test_invalid_shot_type_rejected(self):
        from schemas.asset_tags import AssetTags

        with pytest.raises(ValidationError):
            AssetTags(shot_type="invalid_type")

    def test_confidence_bounds(self):
        from schemas.asset_tags import AssetTags

        with pytest.raises(ValidationError):
            AssetTags(tagging_confidence=1.5)
