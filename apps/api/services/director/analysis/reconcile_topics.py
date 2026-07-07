"""Topic reconciliation for chunked analysis (Phase 12)."""
from __future__ import annotations

from typing import Any

from services.director.analysis.plan_chunks import ChunkPlan, overlap_zone


def _merge_adjacent(topics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not topics:
        return []
    sorted_topics = sorted(topics, key=lambda t: float(t.get("start", 0)))
    merged: list[dict[str, Any]] = [dict(sorted_topics[0])]

    for topic in sorted_topics[1:]:
        prev = merged[-1]
        same_label = prev.get("topicLabel") == topic.get("topicLabel")
        adjacent = float(topic.get("start", 0)) <= float(prev.get("end", 0)) + 0.5
        if same_label and adjacent:
            prev["end"] = max(float(prev.get("end", 0)), float(topic.get("end", 0)))
            prev["confidence"] = max(
                float(prev.get("confidence", 0)),
                float(topic.get("confidence", 0)),
            )
        else:
            merged.append(dict(topic))
    return merged


def reconcile_topics(
    chunk_outputs: list[tuple[ChunkPlan, list[dict[str, Any]]]],
) -> list[dict[str, Any]]:
    """Merge topic boundaries from overlapping chunk windows."""
    if not chunk_outputs:
        return []
    if len(chunk_outputs) == 1:
        return _merge_adjacent(list(chunk_outputs[0][1]))

    owned: list[dict[str, Any]] = []
    for chunk, topics in chunk_outputs:
        for topic in topics:
            start = float(topic.get("start", 0))
            end = float(topic.get("end", start))
            mid = (start + end) / 2
            if chunk.core_start <= mid <= chunk.core_end:
                owned.append(topic)

    for i in range(len(chunk_outputs) - 1):
        zone = overlap_zone(chunk_outputs[i][0], chunk_outputs[i + 1][0])
        if not zone:
            continue
        zone_start, zone_end = zone
        left = [
            t
            for t in chunk_outputs[i][1]
            if zone_start <= float(t.get("start", 0)) <= zone_end
        ]
        right = [
            t
            for t in chunk_outputs[i + 1][1]
            if zone_start <= float(t.get("start", 0)) <= zone_end
        ]
        for left_topic in left:
            match = next(
                (
                    r
                    for r in right
                    if abs(float(r.get("start", 0)) - float(left_topic.get("start", 0))) < 1.5
                ),
                None,
            )
            if match:
                owned.append(
                    left_topic
                    if float(left_topic.get("confidence", 0))
                    >= float(match.get("confidence", 0))
                    else match
                )
            else:
                owned.append(left_topic)

    return _merge_adjacent(owned)
