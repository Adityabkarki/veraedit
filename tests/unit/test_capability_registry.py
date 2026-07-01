"""Tests for capability registry normalization."""
from services.capability_registry import (
    build_gap_report,
    event_allowed_by_registry,
    get_capability,
    normalize_effect_to_toolbox_id,
    toolbox_id_for_event_kind,
)


def test_normalize_zoom_in_cut_alias():
    cap = normalize_effect_to_toolbox_id("zoom_in_cut")
    assert cap is not None
    assert cap["toolbox_id"] == "transition_zoom"


def test_normalize_lower_third_alias():
    cap = normalize_effect_to_toolbox_id("speaker name lower third")
    assert cap is not None
    assert cap["toolbox_id"] == "lower_third"


def test_build_gap_report_mixed_status():
    report = build_gap_report([
        "hook text overlay",
        "glitch cut",
        "totally unknown futuristic effect xyz",
    ])
    assert report["total_detected"] == 3
    assert any(i["toolbox_id"] == "hook_text_overlay" for i in report["implemented"])
    assert any(i["toolbox_id"] == "transition_glitch" for i in report["partial"])
    assert len(report["unresolvable"]) == 1
    assert 0 < report["coverage_pct"] < 100


def test_get_capability_by_toolbox_id():
    cap = get_capability("sfx_whoosh")
    assert cap is not None
    assert cap["renderer"] == "sfx_placement"


def test_event_allowed_blocks_unimplemented():
    allowed, tid, reason = event_allowed_by_registry(
        "transition_glitch",
        {"transition_type": "glitch"},
        strength=0.9,
    )
    assert not allowed
    assert tid == "transition_glitch"
    assert reason == "renderer_not_implemented"


def test_event_allowed_global_kinds():
    allowed, _, _ = event_allowed_by_registry("color_grade", {}, strength=0.5)
    assert allowed


def test_toolbox_id_for_event_kind_hook():
    assert toolbox_id_for_event_kind("hook", {}) == "hook_text_overlay"
