"""Shot type classification — extends scene classification with wide/medium/close_up."""
from __future__ import annotations

from services.director.signals.scene_classification import classify_scene_segments


def _face_ratio_heuristic(scene_type: str, segment_index: int) -> float:
    """Deterministic pseudo face ratio until CV face detector is wired."""
    if scene_type == "screen_recording":
        return 0.0
    if scene_type == "talking_head":
        return 0.12 + (segment_index % 3) * 0.08
    return 0.05 + (segment_index % 2) * 0.04


def _shot_type_from_ratio(ratio: float, scene_type: str) -> str:
    if scene_type == "screen_recording":
        return "screen_recording"
    if ratio < 0.08:
        return "wide"
    if ratio < 0.22:
        return "medium"
    return "close_up"


def classify_shots(
    segments: list[dict],
    *,
    face_metadata: list[dict] | None = None,
) -> list[dict]:
    """
    Classify shot types per segment.

    Returns { startTime, endTime, shotType, confidence, faceBoundingBoxRatio }.
    """
    scenes = classify_scene_segments(segments)
    meta_by_index = {i: m for i, m in enumerate(face_metadata or [])}
    results: list[dict] = []

    for i, scene in enumerate(scenes):
        start = float(scene.get("start", 0))
        end = float(scene.get("end", start))
        scene_type = str(scene.get("sceneType", "unknown"))
        meta = meta_by_index.get(i, {})
        ratio = float(meta.get("faceBoundingBoxRatio", _face_ratio_heuristic(scene_type, i)))
        shot_type = _shot_type_from_ratio(ratio, scene_type)
        if scene_type == "broll_present":
            shot_type = "insert_broll"
        confidence = float(scene.get("confidence", 0.5))
        results.append(
            {
                "startTime": start,
                "endTime": end,
                "shotType": shot_type,
                "confidence": round(confidence, 3),
                "faceBoundingBoxRatio": round(ratio, 4),
            }
        )
    return results
