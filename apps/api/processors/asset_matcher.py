"""
ViraEdit — Template slot to library asset matching (Phase 02).

Scores tagged library assets against slot requirements. Never silently substitutes —
every slot is matched, partial, or missing.
"""
from __future__ import annotations

import structlog
from typing import Any, Literal

from schemas.template import SlotRequirement

log = structlog.get_logger("viraedit.asset_matcher")

MatchStatus = Literal["matched", "partial", "missing"]

# Tunable thresholds — conservative defaults (false "matched" is worse than partial)
MATCH_THRESHOLD = 0.75
PARTIAL_THRESHOLD = 0.45

PLACEHOLDER_SLOT_TYPES = frozenset({"video_placeholder", "image_placeholder"})


def score_asset_against_requirement(asset_tags: dict, req: SlotRequirement) -> float:
    """
    Return 0.0–1.0 confidence for how well a tagged asset fills a slot requirement.
    """
    score = 0.0
    weights_total = 0.0

    weights_total += 0.35
    if asset_tags.get("shot_type") == req.shot_type:
        score += 0.35
    elif asset_tags.get("shot_type") == "unknown":
        score += 0.10

    weights_total += 0.20
    duration = asset_tags.get("duration_seconds")
    if duration is not None:
        if req.min_duration <= duration <= req.max_duration:
            score += 0.20
        elif duration >= req.min_duration * 0.6:
            score += 0.08

    weights_total += 0.15
    if asset_tags.get("energy_level") == req.energy_level:
        score += 0.15
    elif asset_tags.get("energy_level") == "moderate":
        score += 0.06

    weights_total += 0.15
    if req.needs_face:
        if asset_tags.get("has_face"):
            score += 0.15
    else:
        score += 0.15

    weights_total += 0.15
    setting_hint = (req.setting_hint or "").lower()
    asset_setting = str(asset_tags.get("setting", "")).lower()
    if setting_hint and setting_hint in asset_setting:
        score += 0.15
    elif not req.setting_hint:
        score += 0.10

    final = round(score / weights_total, 3) if weights_total else 0.0
    log.debug(
        "asset_match_scored",
        shot_type=asset_tags.get("shot_type"),
        required_shot=req.shot_type,
        score=final,
    )
    return final


def _classify_match(
    best_asset: dict | None,
    best_score: float,
) -> dict[str, Any]:
    if best_asset is None or best_score < PARTIAL_THRESHOLD:
        return {
            "status": "missing",
            "asset_id": None,
            "score": 0.0,
            "storage_key": None,
        }

    status: MatchStatus = "matched" if best_score >= MATCH_THRESHOLD else "partial"
    return {
        "status": status,
        "asset_id": best_asset["id"],
        "score": best_score,
        "storage_key": best_asset["storage_key"],
    }


async def match_template_to_library(
    template: dict,
    library_assets: list[dict],
) -> dict:
    """
    Annotate every placeholder slot with matched / partial / missing status.
    """
    annotated_slots: list[dict] = []

    for slot in template.get("slots", []):
        slot_type = slot.get("type")
        if slot_type not in PLACEHOLDER_SLOT_TYPES:
            annotated_slots.append({**slot, "match": None})
            continue

        requirement = slot.get("requirement")
        if not requirement:
            annotated_slots.append({
                **slot,
                "match": {
                    "status": "missing",
                    "asset_id": None,
                    "score": 0.0,
                    "storage_key": None,
                },
            })
            continue

        req = SlotRequirement.model_validate(requirement)
        wanted_type = "video" if slot_type == "video_placeholder" else "image"
        candidates = [a for a in library_assets if a.get("asset_type") == wanted_type]

        scored = [
            (asset, score_asset_against_requirement(asset.get("tags", {}), req))
            for asset in candidates
        ]
        scored.sort(key=lambda item: item[1], reverse=True)

        best_asset, best_score = scored[0] if scored else (None, 0.0)
        match = _classify_match(best_asset, best_score)
        annotated_slots.append({**slot, "match": match})

    return {**template, "slots": annotated_slots}
