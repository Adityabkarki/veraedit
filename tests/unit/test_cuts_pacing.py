"""Tests for Cuts Motion Engine pacing plans."""
from services.cuts.plan_cuts import plan_cuts_payload, plan_silence_cuts_for_profile


def test_aggressive_trims_more_silences_than_relaxed():
    silences = [
        {"start": 0, "end": 1.0},
        {"start": 5, "end": 6.5},
        {"start": 10, "end": 11.0},
    ]
    relaxed = plan_silence_cuts_for_profile(silences, "relaxed")
    aggressive = plan_silence_cuts_for_profile(silences, "aggressive")
    assert len(aggressive) >= len(relaxed)


def test_social_defaults_to_aggressive_profile():
    plan = plan_cuts_payload(
        silences=[{"start": 0, "end": 2.0}],
        fillers=[{"start": 3, "end": 3.5, "words": ["um"]}],
        content_type="social",
    )
    assert plan["profile"] == "aggressive"
    assert plan["fillerActions"][0]["type"] == "filler_speed_ramp"


def test_podcast_defaults_to_relaxed_profile():
    plan = plan_cuts_payload(
        silences=[{"start": 0, "end": 1.5}],
        content_type="podcast",
    )
    assert plan["profile"] == "relaxed"


def test_balanced_filler_uses_cut_not_ramp():
    plan = plan_cuts_payload(
        fillers=[{"start": 1, "end": 1.4, "words": ["uh"]}],
        content_type="consultancy",
    )
    assert plan["profile"] == "balanced"
    assert plan["fillerActions"][0]["type"] == "filler_cut"
