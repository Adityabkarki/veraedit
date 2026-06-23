"""
ViraEdit — Master edit planner (podcast profile).

Produces content-focused cut / hook / filler suggestions from micro-scenes
and audio intelligence. Can use LLM (via ai_client) or rule-based fallback.
"""
from __future__ import annotations

import json
from typing import Any


def _fmt_time(seconds: float) -> str:
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m}:{s:02d}"


def build_rule_based_master_suggestions(
    micro_scenes: list[dict],
    filler_sections: list[dict],
    best_hook: dict,
    content_type: str,
) -> list[dict]:
    """Podcast-safe suggestions without an extra LLM call."""
    suggestions: list[dict] = []

    for filler in filler_sections[:8]:
        if not filler.get("recommended_cut", True):
            continue
        start = float(filler.get("start_time", 0))
        end = float(filler.get("end_time", start))
        reason = filler.get("reason", "Filler or dead air")
        suggestions.append({
            "type": "remove_filler",
            "title": f"Trim filler at {_fmt_time(start)}",
            "description": (
                f"{reason}. Removing this tightens pacing while keeping natural breaths "
                f"elsewhere in the episode."
            ),
            "start_time": start,
            "end_time": end,
            "action": {
                "action": "cut_range",
                "start": start,
                "end": end,
                "reason": reason,
                "master_edit": True,
            },
            "confidence": 0.88,
            "impact": "high",
            "transcript_excerpt": "",
        })

    hook_start = float(best_hook.get("start_time", 0)) if best_hook else 0.0
    hook_end = float(best_hook.get("end_time", 0)) if best_hook else 0.0
    if best_hook and hook_end > hook_start + 5 and hook_start > 30:
        suggestions.append({
            "type": "hook_rewrite",
            "title": "Cold open with your strongest moment",
            "description": (
                f"Move the peak moment at {_fmt_time(hook_start)}–{_fmt_time(hook_end)} "
                f"to the start. {best_hook.get('reason', 'Strongest hook for retention')}."
            ),
            "start_time": 0.0,
            "end_time": 30.0,
            "action": {
                "action": "move_to_front",
                "source_start": hook_start,
                "source_end": hook_end,
                "master_edit": True,
            },
            "confidence": float(best_hook.get("confidence", 0.8)),
            "impact": "high",
            "transcript_excerpt": best_hook.get("transcript_excerpt", ""),
        })

    if content_type == "podcast":
        for scene in micro_scenes:
            dur = float(scene.get("end_time", 0)) - float(scene.get("start_time", 0))
            intent = (scene.get("intent") or scene.get("platform_scores", {}).get("intent", ""))
            if intent == "filler" and dur > 3:
                suggestions.append({
                    "type": "cut",
                    "title": f"Cut low-value tangent ({_fmt_time(scene['start_time'])})",
                    "description": (
                        scene.get("summary")
                        or "Off-topic or repetitive section — trim to keep episode focused."
                    ),
                    "start_time": float(scene.get("start_time", 0)),
                    "end_time": float(scene.get("end_time", 0)),
                    "action": {
                        "action": "cut_range",
                        "start": scene.get("start_time"),
                        "end": scene.get("end_time"),
                        "master_edit": True,
                    },
                    "confidence": 0.75,
                    "impact": "medium",
                    "transcript_excerpt": scene.get("transcript_excerpt", ""),
                })

    return suggestions[:12]


def map_llm_master_plan_to_suggestions(plan: dict[str, Any]) -> list[dict]:
    """Convert MASTER_EDIT LLM JSON to suggestion dicts."""
    out: list[dict] = []
    for item in plan.get("suggestions", []):
        sug_type = str(item.get("type", "cut")).lower()
        out.append({
            "type": sug_type,
            "title": item.get("title", "Master edit"),
            "description": item.get("description", ""),
            "start_time": item.get("start_time"),
            "end_time": item.get("end_time"),
            "action": {**(item.get("action") or {}), "master_edit": True},
            "confidence": float(item.get("confidence", 0.8)),
            "impact": item.get("impact", "medium"),
            "transcript_excerpt": item.get("transcript_excerpt", ""),
        })
    return out
