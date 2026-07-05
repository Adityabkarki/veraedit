"""Build transcript segments from word-level timestamps for signal extraction."""
from __future__ import annotations


def words_to_segments(words: list[dict], *, gap_seconds: float = 1.5) -> list[dict]:
    """
    Group word timestamps into sentence-like segments when inter-word gaps exceed gap_seconds.
    """
    segments: list[dict] = []
    current: list[dict] = []
    seg_start: float | None = None

    for word in words:
        if word.get("type") == "silence":
            continue
        text = str(word.get("word") or word.get("text") or "").strip()
        if not text:
            continue
        start = float(word.get("start", 0))
        end = float(word.get("end", start))

        if not current:
            current = [word]
            seg_start = start
            continue

        prev_end = float(current[-1].get("end", 0))
        if start - prev_end > gap_seconds:
            segments.append(_segment_from_words(current, seg_start or 0))
            current = [word]
            seg_start = start
        else:
            current.append(word)

    if current:
        segments.append(_segment_from_words(current, seg_start or 0))

    return segments


def _segment_from_words(words: list[dict], start: float) -> dict:
    text = " ".join(str(w.get("word") or w.get("text") or "").strip() for w in words).strip()
    end = float(words[-1].get("end", start))
    return {"text": text, "start": start, "end": end}
