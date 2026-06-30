"""
Unit tests for asset matcher (Phase 02).

Run: pytest tests/unit/test_asset_matcher.py -v
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


class TestAssetMatcherScoring:
    def test_perfect_match_scores_high(self):
        from processors.asset_matcher import score_asset_against_requirement
        from schemas.template import SlotRequirement

        req = SlotRequirement(
            shot_type="talking_head",
            energy_level="high_energy",
            min_duration=3,
            max_duration=5,
            needs_face=True,
            setting_hint="studio",
            description="Energetic talking head",
        )
        tags = {
            "shot_type": "talking_head",
            "energy_level": "high_energy",
            "duration_seconds": 4,
            "has_face": True,
            "setting": "studio",
        }
        score = score_asset_against_requirement(tags, req)
        assert score >= 0.9

    def test_shot_type_mismatch_scores_low(self):
        from processors.asset_matcher import score_asset_against_requirement
        from schemas.template import SlotRequirement

        req = SlotRequirement(
            shot_type="product_shot",
            energy_level="calm",
            min_duration=2,
            max_duration=4,
            description="Product close-up",
        )
        tags = {
            "shot_type": "talking_head",
            "energy_level": "high_energy",
            "duration_seconds": 10,
            "has_face": True,
            "setting": "outdoor",
        }
        score = score_asset_against_requirement(tags, req)
        assert score < 0.45


@pytest.mark.asyncio
async def test_match_template_to_library_statuses():
    from processors.asset_matcher import MATCH_THRESHOLD, PARTIAL_THRESHOLD, match_template_to_library

    template = {
        "version": "2.0",
        "duration": 10,
        "aspect_ratio": "9:16",
        "slots": [
            {
                "slot_id": "clip_1",
                "type": "video_placeholder",
                "start": 0,
                "end": 4,
                "label": "Hook",
                "requirement": {
                    "shot_type": "talking_head",
                    "energy_level": "high_energy",
                    "min_duration": 3,
                    "max_duration": 5,
                    "needs_face": True,
                    "description": "Energetic hook",
                },
            },
            {
                "slot_id": "hook_text",
                "type": "text_overlay",
                "start": 0,
                "end": 3,
                "label": "Headline",
                "requirement": None,
            },
        ],
    }
    library = [
        {
            "id": "asset-1",
            "asset_type": "video",
            "storage_key": "users/u/library/a.mp4",
            "tags": {
                "shot_type": "talking_head",
                "energy_level": "high_energy",
                "duration_seconds": 4,
                "has_face": True,
                "setting": "studio",
            },
        },
        {
            "id": "asset-2",
            "asset_type": "video",
            "storage_key": "users/u/library/b.mp4",
            "tags": {
                "shot_type": "b_roll",
                "energy_level": "calm",
                "duration_seconds": 8,
                "has_face": False,
                "setting": "outdoor",
            },
        },
    ]

    result = await match_template_to_library(template, library)
    hook_match = result["slots"][0]["match"]
    assert hook_match["status"] == "matched"
    assert hook_match["asset_id"] == "asset-1"
    assert result["slots"][1]["match"] is None

    # Weak match → partial (talking_head vs product_shot still scores ~0.6)
    template["slots"][0]["requirement"]["shot_type"] = "product_shot"
    result2 = await match_template_to_library(template, library)
    assert result2["slots"][0]["match"]["status"] == "partial"

    # Empty library → missing
    result3 = await match_template_to_library(template, [])
    assert result3["slots"][0]["match"]["status"] == "missing"

    assert MATCH_THRESHOLD == 0.75
    assert PARTIAL_THRESHOLD == 0.45
