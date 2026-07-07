"""B-roll match confidence scoring for Director stock search."""
from __future__ import annotations

import re
from typing import Any

from processors.asset_matcher import MATCH_THRESHOLD, PARTIAL_THRESHOLD

log_name = "viraedit.director.broll_confidence"

# Validated on real podcast/consultancy placements (Phase 16 review).
# First Pexels result positional prior + query overlap heuristic.
POSITION_PRIORS = [0.72, 0.58, 0.48, 0.42, 0.38]


def _tokenize(text: str) -> set[str]:
    return {t for t in re.split(r"[\W_]+", text.lower()) if len(t) > 2}


def score_broll_match(query: str, result_index: int = 0, *, tags: str = "") -> float:
    """
    Score a Pexels result against the search query.

    Uses positional prior (API relevance order) plus token overlap when tags exist.
    Returns 0.0–1.0 confidence.
    """
    base = POSITION_PRIORS[min(result_index, len(POSITION_PRIORS) - 1)]
    if not query.strip():
        return base * 0.5

    query_tokens = _tokenize(query)
    if not query_tokens:
        return base

    tag_tokens = _tokenize(tags)
    if not tag_tokens:
        return base

    overlap = len(query_tokens & tag_tokens) / max(len(query_tokens), 1)
    return min(1.0, base * 0.55 + overlap * 0.45)


def pick_best_broll_match(
    query: str,
    results: list[dict[str, Any]],
) -> tuple[dict[str, Any] | None, float]:
    """Return best result and its confidence, or (None, 0.0)."""
    if not results:
        return None, 0.0

    best: dict[str, Any] | None = None
    best_score = 0.0
    for i, row in enumerate(results):
        tags = str(row.get("tags") or row.get("title") or "")
        score = score_broll_match(query, i, tags=tags)
        if score > best_score:
            best_score = score
            best = row

    return best, best_score


def is_usable_broll_confidence(score: float) -> bool:
    """True when clip clears the partial threshold (usable with fallback awareness)."""
    return score >= PARTIAL_THRESHOLD


def is_strong_broll_confidence(score: float) -> bool:
    """True when clip clears the exact-match threshold."""
    return score >= MATCH_THRESHOLD


__all__ = [
    "MATCH_THRESHOLD",
    "PARTIAL_THRESHOLD",
    "is_strong_broll_confidence",
    "is_usable_broll_confidence",
    "pick_best_broll_match",
    "score_broll_match",
]
