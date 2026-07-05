"""Topic segmentation — heuristic chapter boundaries from transcript segments."""
from __future__ import annotations

_TOPIC_SHIFT_GAP = 2.5  # seconds between segments → new topic


def extract_topic_shifts(segments: list[dict]) -> list[dict]:
    """
    Cluster transcript segments into topic blocks.

    Returns list of { start, end, confidence, topicLabel }.
    """
    if not segments:
        return []

    ordered = sorted(segments, key=lambda s: float(s.get("start", 0)))
    blocks: list[dict] = []
    block_start = float(ordered[0].get("start", 0))
    block_end = float(ordered[0].get("end", block_start))
    block_texts: list[str] = [str(ordered[0].get("text", "")).strip()]
    prev_end = block_end

    for seg in ordered[1:]:
        start = float(seg.get("start", prev_end))
        end = float(seg.get("end", start))
        text = str(seg.get("text", "")).strip()
        gap = start - prev_end

        if gap >= _TOPIC_SHIFT_GAP and block_texts:
            blocks.append(_finalize_block(block_start, block_end, block_texts))
            block_start = start
            block_texts = []

        block_texts.append(text)
        block_end = end
        prev_end = end

    if block_texts:
        blocks.append(_finalize_block(block_start, block_end, block_texts))

    return blocks


def _finalize_block(start: float, end: float, texts: list[str]) -> dict:
    label = _topic_label(texts)
    duration = max(end - start, 0.1)
    confidence = min(0.95, 0.55 + duration / 60)
    return {
        "start": start,
        "end": end,
        "confidence": round(confidence, 3),
        "topicLabel": label,
    }


def _topic_label(texts: list[str]) -> str:
    combined = " ".join(t for t in texts if t).strip()
    if not combined:
        return "Topic"
    words = combined.split()
    if len(words) <= 6:
        return combined[:48]
    return " ".join(words[:5]) + "…"
