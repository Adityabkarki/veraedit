"""Emphasis / pull-quote scoring from audio analysis + sentence boundaries."""
from __future__ import annotations


def extract_emphasis_moments(
    segments: list[dict],
    audio_frames: list[dict] | None = None,
    *,
    fps: float = 30.0,
) -> list[dict]:
    """
    Score transcript segments by vocal energy.

    audio_frames entries: { frame, overallAmplitude, isTransient }
    Returns { start, end, confidence, text }.
    """
    frame_map: dict[int, dict] = {}
    for fr in audio_frames or []:
        frame_map[int(fr.get("frame", 0))] = fr

    results: list[dict] = []
    for seg in segments:
        text = str(seg.get("text", "")).strip()
        start = float(seg.get("start", 0))
        end = float(seg.get("end", start))
        if len(text.split()) < 3:
            continue

        energy = _segment_energy(start, end, frame_map, fps)
        confidence = min(0.95, 0.45 + energy * 0.55)
        if confidence >= 0.65:
            results.append(
                {
                    "start": start,
                    "end": end,
                    "confidence": round(confidence, 3),
                    "text": text,
                }
            )
    return results


def _segment_energy(
    start: float,
    end: float,
    frame_map: dict[int, dict],
    fps: float,
) -> float:
    if not frame_map:
        return 0.55

    start_frame = int(start * fps)
    end_frame = max(start_frame + 1, int(end * fps))
    samples: list[float] = []
    transients = 0
    for f in range(start_frame, end_frame):
        fr = frame_map.get(f)
        if not fr:
            continue
        samples.append(float(fr.get("overallAmplitude", 0)))
        if fr.get("isTransient"):
            transients += 1

    if not samples:
        return 0.5
    avg = sum(samples) / len(samples)
    transient_boost = min(0.3, transients / max(len(samples), 1))
    return min(1.0, avg + transient_boost)
