"""
Aggregate logged AI spend for a single asset (from costs table + transcript).
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.cost import Cost

# Human labels for cost.task values
TASK_LABELS: dict[str, str] = {
    "transcription": "Transcription (ElevenLabs Scribe)",
    "scene_analysis": "Chapter detection",
    "suggestions": "Edit suggestions",
    "editorial_analysis": "Editorial analysis",
    "hook_rewrite": "Hook rewrite",
    "shorts_extraction": "Shorts extraction",
    "visual_opportunity": "Visual opportunities",
    "style_extract": "Style extract",
    "prompt_compile": "Prompt compile",
}

PROVIDER_LABELS: dict[str, str] = {
    "elevenlabs": "ElevenLabs",
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "other": "Other",
}


def provider_from_model(model: str) -> str:
    m = (model or "").lower()
    if "elevenlabs" in m or "scribe" in m:
        return "elevenlabs"
    if "openai" in m or "gpt" in m:
        return "openai"
    if "anthropic" in m or "claude" in m:
        return "anthropic"
    return "other"


def task_label(task: str) -> str:
    return TASK_LABELS.get(task, task.replace("_", " ").title())


async def build_asset_spend_summary(
    db: AsyncSession,
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    *,
    transcript_cost_usd: float | None = None,
) -> dict[str, Any]:
    """
    Sum costs logged for this asset, grouped by provider and by action (task).
    """
    result = await db.execute(
        select(Cost)
        .where(
            Cost.project_id == project_id,
            Cost.asset_id == asset_id,
        )
        .order_by(Cost.created_at.asc())
    )
    rows = list(result.scalars().all())

    extra_transcription_usd = 0.0
    has_transcription_log = any(r.task == "transcription" for r in rows)
    if (
        not has_transcription_log
        and transcript_cost_usd is not None
        and transcript_cost_usd > 0
    ):
        extra_transcription_usd = float(transcript_cost_usd)

    by_provider: dict[str, float] = {
        "elevenlabs": 0.0,
        "openai": 0.0,
        "anthropic": 0.0,
        "other": 0.0,
    }
    by_task: dict[str, dict[str, Any]] = {}

    for c in rows:
        provider = provider_from_model(c.model)
        cost = float(c.cost_usd or 0.0)
        by_provider[provider] = round(by_provider.get(provider, 0.0) + cost, 6)

        key = c.task
        if key not in by_task:
            by_task[key] = {
                "task": key,
                "label": task_label(key),
                "provider": provider,
                "provider_label": PROVIDER_LABELS.get(provider, provider),
                "model": c.model,
                "cost_usd": 0.0,
                "call_count": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "audio_seconds": 0.0,
            }
        entry = by_task[key]
        entry["cost_usd"] = round(entry["cost_usd"] + cost, 6)
        entry["call_count"] += 1
        if c.input_tokens:
            entry["input_tokens"] = (entry["input_tokens"] or 0) + c.input_tokens
        if c.output_tokens:
            entry["output_tokens"] = (entry["output_tokens"] or 0) + c.output_tokens
        if c.audio_seconds:
            entry["audio_seconds"] = round(
                (entry["audio_seconds"] or 0.0) + float(c.audio_seconds), 2
            )

    if extra_transcription_usd > 0:
        by_provider["elevenlabs"] = round(
            by_provider.get("elevenlabs", 0.0) + extra_transcription_usd, 6
        )
        by_task["transcription"] = {
            "task": "transcription",
            "label": task_label("transcription"),
            "provider": "elevenlabs",
            "provider_label": PROVIDER_LABELS["elevenlabs"],
            "model": "elevenlabs/scribe_v2",
            "cost_usd": round(extra_transcription_usd, 6),
            "call_count": 1,
            "input_tokens": 0,
            "output_tokens": 0,
            "audio_seconds": 0.0,
        }

    total = round(sum(by_provider.values()), 6)
    actions = sorted(by_task.values(), key=lambda x: -x["cost_usd"])
    call_count = len(rows) + (1 if extra_transcription_usd > 0 else 0)

    return {
        "total_usd": total,
        "call_count": call_count,
        "by_provider": {
            k: {
                "provider": k,
                "label": PROVIDER_LABELS.get(k, k),
                "cost_usd": round(v, 6),
            }
            for k, v in by_provider.items()
            if v > 0 or k in ("elevenlabs", "openai")
        },
        "by_action": actions,
        "elevenlabs_usd": round(by_provider.get("elevenlabs", 0.0), 6),
        "openai_usd": round(
            by_provider.get("openai", 0.0) + by_provider.get("anthropic", 0.0), 6
        ),
    }
