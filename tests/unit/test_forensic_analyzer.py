"""Tests for forensic style reverse-engineering report builder."""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "apps" / "api"))

from tasks.style_transfer.edit_toolbox import FORENSIC_DEFAULT_TOOL_IDS, resolve_tool_ids_for_event
from tasks.style_transfer.forensic_analyzer import build_forensic_report
from tasks.style_transfer.models import PacingProfile, StyleDNA


def test_build_forensic_report_hyper_pacing():
    dna = StyleDNA(
        pacing=PacingProfile(avg_cut_duration_ms=1080, cuts_per_minute=55),
        source_title="Test Short",
    )
    scenes = [
        {"start_ms": 0, "end_ms": 1080},
        {"start_ms": 1080, "end_ms": 2160},
        {"start_ms": 2160, "end_ms": 3240},
    ]
    report = build_forensic_report(dna, scenes, 90.0, preset_name="Kejriwal Style")
    d = report.to_dict()

    assert d["master_template_name"] == "Kejriwal Style"
    assert d["section_1_high_level"]["intensity_metrics"]["editing_intensity"] >= 8.0
    assert len(d["section_2_timeline"]) >= 1
    assert d["section_3_cutting_rhythm"]["average_shot_duration_s"] == 1.08
    assert len(d["section_10_rulebook"]) >= 5
    assert "camera" in d["section_11_ai_yaml"]
    assert d["section_12_ai_prompt"]


def test_forensic_tool_resolution_shot_and_sfx():
    host = resolve_tool_ids_for_event("shot", {"shot_type": "aroll_host"})
    assert "shot_aroll_host" in host

    thud = resolve_tool_ids_for_event("sfx", {"sfx_type": "sub_bass_thud"})
    assert "sfx_sub_bass_thud" in thud

    assert "zoom_step_115" in FORENSIC_DEFAULT_TOOL_IDS
    assert "retention_open_loop" in FORENSIC_DEFAULT_TOOL_IDS
