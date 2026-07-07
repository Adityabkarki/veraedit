"""Trigger reconciliation for chunked analysis (Phase 12)."""
from __future__ import annotations

from typing import Any

from services.director.analysis.plan_chunks import ChunkPlan, overlap_zone

_DEDUPE_TOLERANCE_SECONDS = 1.5


def _trigger_identity(item: dict[str, Any]) -> str:
    label = item.get("type") or item.get("label") or item.get("value") or item.get("text") or ""
    return str(label).lower()


def _in_zone(item: dict[str, Any], zone_start: float, zone_end: float) -> bool:
    start = float(item.get("start", 0))
    end = float(item.get("end", start))
    mid = (start + end) / 2
    return zone_start <= mid <= zone_end


def _is_duplicate(a: dict[str, Any], b: dict[str, Any]) -> bool:
    if _trigger_identity(a) != _trigger_identity(b):
        return False
    return abs(float(a.get("start", 0)) - float(b.get("start", 0))) <= _DEDUPE_TOLERANCE_SECONDS


def reconcile_triggers(
    chunk_outputs: list[tuple[ChunkPlan, list[dict[str, Any]]]],
) -> list[dict[str, Any]]:
    """Deduplicate triggers detected in overlapping chunk windows."""
    if not chunk_outputs:
        return []
    if len(chunk_outputs) == 1:
        return list(chunk_outputs[0][1])

    merged = [t for _, triggers in chunk_outputs for t in triggers]
    overlap_ranges: list[tuple[float, float]] = []
    for i in range(len(chunk_outputs) - 1):
        zone = overlap_zone(chunk_outputs[i][0], chunk_outputs[i + 1][0])
        if zone:
            overlap_ranges.append(zone)

    kept: list[dict[str, Any]] = []

    for item in sorted(merged, key=lambda t: float(t.get("start", 0))):
        in_overlap = any(_in_zone(item, z[0], z[1]) for z in overlap_ranges)
        if not in_overlap:
            kept.append(item)
            continue

        duplicate_idx = next(
            (idx for idx, existing in enumerate(kept) if _is_duplicate(existing, item)),
            -1,
        )
        if duplicate_idx >= 0:
            if float(item.get("confidence", 0)) > float(kept[duplicate_idx].get("confidence", 0)):
                kept[duplicate_idx] = item
            continue

        kept.append(item)

    return sorted(kept, key=lambda t: float(t.get("start", 0)))
