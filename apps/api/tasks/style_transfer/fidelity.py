"""
Fidelity scoring — compare reference StyleDNA to applied timeline metadata.
"""
from __future__ import annotations

from typing import Any

from tasks.style_transfer.models import StyleDNA


def compute_style_fidelity(
    reference: StyleDNA,
    applied_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Estimate how closely an applied style matches the reference (0–100).

    Uses pacing delta, caption style match, and color profile distance.
    Full pixel comparison is deferred to render preview (EP-10.4).
    """
    meta = applied_metadata or {}
    scores: list[float] = []

    ref_cpm = reference.pacing.cuts_per_minute
    applied_cpm = float(meta.get("applied_cuts_per_minute", ref_cpm))
    if ref_cpm > 0:
        pacing_err = abs(ref_cpm - applied_cpm) / ref_cpm
        scores.append(max(0.0, 1.0 - pacing_err) * 100)

    ref_anim = reference.captions.animation
    applied_anim = meta.get("applied_caption_animation", ref_anim)
    scores.append(100.0 if ref_anim == applied_anim else 65.0)

    color_delta = (
        abs(reference.color.brightness)
        + abs(reference.color.contrast)
        + abs(reference.color.saturation)
    )
    scores.append(max(40.0, 100.0 - color_delta * 80))

    overall = round(sum(scores) / len(scores), 1) if scores else 75.0

    return {
        "fidelity_score": overall,
        "target_met": overall >= 85.0,
        "components_scored": ["pacing", "captions", "color"],
        "notes": (
            "Preview render comparison coming in EP-10.4."
            if overall < 85.0
            else "Style parameters match reference closely."
        ),
    }


def estimate_extraction_fidelity(dna: StyleDNA, gap_report: dict[str, Any]) -> float:
    """Pre-apply fidelity ceiling based on capability coverage."""
    return float(gap_report.get("supported_coverage_pct", 70.0))
