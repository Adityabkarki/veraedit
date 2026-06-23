"""
ViraEdit — LLM-backed short clip analyzer.

Enriches shorts_engine candidates with transcript-grounded titles and hooks.
"""
from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger("viraedit.tasks.shorts_analyzer")


def enrich_short_candidates(
    candidates: list[dict],
    budget: Any,
    *,
    use_llm: bool = True,
) -> list[dict]:
    """Merge LLM analysis into short action dicts. Falls back to templates on failure."""
    if not candidates:
        return []

    if not use_llm:
        return candidates

    try:
        from tasks.ai_client import analyze_short_clips
        from tasks.model_router import BudgetState

        b = budget if budget is not None else BudgetState()
        payload = []
        for i, c in enumerate(candidates[:8]):
            payload.append({
                "candidate_id": str(i),
                "start_time": c.get("start_time"),
                "end_time": c.get("end_time"),
                "duration": c.get("duration"),
                "title": c.get("title"),
                "summary": c.get("summary"),
                "transcript_excerpt": c.get("transcript_excerpt", ""),
            })

        result = analyze_short_clips(payload, budget=b)
        clips_by_id = {str(x.get("candidate_id")): x for x in result.content.get("clips", [])}

        enriched: list[dict] = []
        for i, c in enumerate(candidates):
            merged = dict(c)
            info = clips_by_id.get(str(i), {})
            if info.get("title"):
                merged["title"] = info["title"]
            if info.get("about"):
                merged["about"] = info["about"]
                merged["description"] = info["about"]
            hooks = info.get("hooks")
            if hooks and isinstance(hooks, list):
                merged["hooks"] = hooks
                merged["hook_options"] = hooks
                merged["active_hook"] = hooks[0]
            start_adj = float(info.get("trim_start_adjust", 0) or 0)
            end_adj = float(info.get("trim_end_adjust", 0) or 0)
            if start_adj or end_adj:
                merged["start_time"] = max(0.0, float(merged.get("start_time", 0)) + start_adj)
                merged["end_time"] = float(merged.get("end_time", 0)) + end_adj
                merged["duration"] = merged["end_time"] - merged["start_time"]
            merged["llm_enriched"] = True
            enriched.append(merged)
        return enriched

    except Exception as exc:
        log.warning("shorts_analyzer_llm_failed: %s", exc)
        return candidates
