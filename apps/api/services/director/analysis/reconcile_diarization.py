"""Diarization reconciliation for chunked analysis (Phase 12)."""
from __future__ import annotations

import math
from typing import Any

from services.director.analysis.plan_chunks import ChunkPlan


SIMILARITY_THRESHOLD = 0.82


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _segments_in_window(
    segments: list[dict[str, Any]],
    start: float,
    end: float,
) -> list[dict[str, Any]]:
    return [
        s
        for s in segments
        if float(s.get("end", 0)) > start and float(s.get("start", 0)) < end
    ]


def reconcile_diarization(
    chunk_outputs: list[tuple[ChunkPlan, list[dict[str, Any]], dict[str, list[float]] | None]],
) -> list[dict[str, Any]]:
    """
    Reconcile local speaker IDs across chunks into global, file-consistent IDs.

    chunk_outputs: list of (chunk_plan, segments, optional speaker_embeddings)
    """
    if not chunk_outputs:
        return []
    if len(chunk_outputs) == 1:
        return list(chunk_outputs[0][1])

    global_map: dict[str, str] = {}
    next_global = 0
    chunk_local_to_global: list[dict[str, str]] = []

    def assign_global(local_key: str) -> str:
        nonlocal next_global
        if local_key in global_map:
            return global_map[local_key]
        gid = f"G{next_global}"
        next_global += 1
        global_map[local_key] = gid
        return gid

    for i, (chunk, segments, speaker_embeddings) in enumerate(chunk_outputs):
        local_map: dict[str, str] = {}
        speaker_embeddings = speaker_embeddings or {}

        if i == 0:
            for seg in segments:
                sid = str(seg.get("speakerId", "A"))
                key = f"{chunk.chunk_index}:{sid}"
                local_map[sid] = assign_global(key)
            chunk_local_to_global.append(local_map)
            continue

        prev_chunk, prev_segments, prev_embeddings = chunk_outputs[i - 1]
        prev_map = chunk_local_to_global[i - 1]
        prev_embeddings = prev_embeddings or {}

        overlap_start = max(prev_chunk.window_start, chunk.window_start)
        overlap_end = min(prev_chunk.window_end, chunk.window_end)

        prev_overlap = _segments_in_window(prev_segments, overlap_start, overlap_end)
        curr_overlap = _segments_in_window(segments, overlap_start, overlap_end)

        for curr_seg in curr_overlap:
            curr_id = str(curr_seg.get("speakerId", "A"))
            best_global: str | None = None
            best_score = SIMILARITY_THRESHOLD
            curr_emb = speaker_embeddings.get(curr_id)

            for prev_seg in prev_overlap:
                prev_id = str(prev_seg.get("speakerId", "A"))
                prev_emb = prev_embeddings.get(prev_id)
                if curr_emb and prev_emb:
                    score = _cosine_similarity(curr_emb, prev_emb)
                else:
                    overlap = min(
                        float(curr_seg.get("end", 0)),
                        float(prev_seg.get("end", 0)),
                    ) - max(
                        float(curr_seg.get("start", 0)),
                        float(prev_seg.get("start", 0)),
                    )
                    score = 0.85 if overlap > 0 and curr_id == prev_id else 0.0

                if score >= best_score:
                    best_score = score
                    best_global = prev_map.get(prev_id)

            if best_global:
                local_map[curr_id] = best_global

        for seg in segments:
            sid = str(seg.get("speakerId", "A"))
            if sid not in local_map:
                key = f"{chunk.chunk_index}:{sid}"
                local_map[sid] = assign_global(key)

        chunk_local_to_global.append(local_map)

    reconciled: list[dict[str, Any]] = []
    for i, (chunk, segments, _) in enumerate(chunk_outputs):
        local_map = chunk_local_to_global[i]
        for seg in segments:
            start = float(seg.get("start", 0))
            end = float(seg.get("end", start))
            mid = (start + end) / 2
            if mid < chunk.core_start or mid > chunk.core_end:
                continue
            sid = str(seg.get("speakerId", "A"))
            reconciled.append({**seg, "speakerId": local_map.get(sid, sid)})

    return sorted(reconciled, key=lambda s: float(s.get("start", 0)))
