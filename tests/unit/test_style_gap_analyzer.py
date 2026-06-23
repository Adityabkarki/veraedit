"""Tests for style transfer capability gap analysis."""
from tasks.style_transfer.gap_analyzer import build_effect_inventory, build_gap_report
from tasks.style_transfer.models import (
    AudioProfile,
    CaptionStyleProfile,
    PacingProfile,
    StyleDNA,
    TransitionProfile,
)


def test_build_effect_inventory_detects_captions_and_cuts():
    dna = StyleDNA(
        captions=CaptionStyleProfile(animation="pop"),
        transitions=TransitionProfile(primary_type="fade"),
        pacing=PacingProfile(cuts_per_minute=28),
        audio=AudioProfile(music_energy="medium"),
    )
    inventory = build_effect_inventory(dna)
    ids = {i["id"] for i in inventory}
    assert "caption_pop" in ids
    assert "fade_transition" in ids
    assert "music_bed" in ids


def test_build_gap_report_coverage():
    dna = StyleDNA(
        captions=CaptionStyleProfile(animation="pop"),
        transitions=TransitionProfile(primary_type="whip_pan"),
    )
    report = build_gap_report(dna)
    assert "supported_coverage_pct" in report
    assert report["partial_count"] >= 1 or report["missing_count"] >= 1
    assert any(m["id"] == "whip_pan" for m in report["missing_capabilities"])
