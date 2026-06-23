"""
ViraEdit — Costs API router (EP-1.5 / T-1.5.3).

Budget transparency: every AI API call is logged to the costs table.
These endpoints let users see exactly what they've spent.

Endpoints:
  GET /projects/{id}/costs         costs for a single project
  GET /costs/summary               user's total monthly costs

Budget limits (from settings):
  $2.00/hr per video = hard limit enforced by ModelRouter
  Alert at 80%, hard stop at 100%

Cost log fields per call:
  model          e.g. "elevenlabs/scribe_v2", "openai/gpt-4o-mini"
  task           e.g. "transcription", "scene_analysis", "hook_rewrite"
  input_tokens   for LLM calls
  output_tokens  for LLM calls
  audio_seconds  for Whisper calls
  cost_usd       actual cost in USD

Typical costs per hour of Nepali video:
  Whisper transcription:  ~$0.02
  Scene analysis (Claude): ~$0.08
  Hook generation:         ~$0.02
  Shorts extraction:       ~$0.02
  Total:                   ~$0.14/hr (well within $2.00 budget)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, Query
from sqlalchemy import func, select

from dependencies import CurrentUser, DbDep
from exceptions import ProjectNotFoundError
from models import Project
from models.cost import Cost

router = APIRouter(prefix="/api/v1", tags=["costs"])
log = structlog.get_logger("viraedit.costs")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _cost_to_dict(c: Cost) -> dict:
    return {
        "id": str(c.id),
        "project_id": str(c.project_id),
        "asset_id": str(c.asset_id) if c.asset_id else None,
        "model": c.model,
        "task": c.task,
        "input_tokens": c.input_tokens,
        "output_tokens": c.output_tokens,
        "audio_seconds": c.audio_seconds,
        "cost_usd": round(c.cost_usd, 6),
        "created_at": c.created_at.isoformat(),
    }


# ── GET /projects/{id}/costs ──────────────────────────────────────────────────

@router.get(
    "/projects/{project_id}/costs",
    summary="Get AI cost breakdown for a project",
)
async def get_project_costs(
    project_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    limit: int = Query(100, ge=1, le=500),
    task_filter: Optional[str] = Query(None, alias="task"),
) -> dict:
    """
    Return the detailed AI cost log for a project.

    Each row represents one AI API call:
    - Whisper transcription calls (audio_seconds filled)
    - LLM calls for scene analysis, hooks, suggestions (tokens filled)

    Optionally filter by task name:
    transcription, scene_analysis, editorial_analysis, hook_rewrite,
    shorts_extraction, visual_opportunity, style_extract, prompt_compile
    """
    # Verify project ownership
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id,
        )
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise ProjectNotFoundError()

    # Build query
    query = (
        select(Cost)
        .where(Cost.project_id == project_id)
        .order_by(Cost.created_at.desc())
        .limit(limit)
    )
    if task_filter:
        query = query.where(Cost.task == task_filter)

    result = await db.execute(query)
    costs = result.scalars().all()

    # Aggregate totals
    total_usd = sum(c.cost_usd for c in costs)
    by_model: dict[str, float] = {}
    by_task: dict[str, float] = {}
    for c in costs:
        by_model[c.model] = round(by_model.get(c.model, 0.0) + c.cost_usd, 6)
        by_task[c.task] = round(by_task.get(c.task, 0.0) + c.cost_usd, 6)

    # Budget status
    budget_limit = 2.00  # $2.00 hard limit
    budget_used_pct = round((total_usd / budget_limit) * 100, 1) if budget_limit > 0 else 0.0
    budget_status = (
        "over_limit" if total_usd >= budget_limit
        else "warning" if total_usd >= budget_limit * 0.8
        else "ok"
    )

    log.info(
        "project_costs_fetched",
        project_id=str(project_id),
        total_usd=round(total_usd, 4),
        row_count=len(costs),
    )
    return {
        "project_id": str(project_id),
        "row_count": len(costs),
        "total_cost_usd": round(total_usd, 4),
        "budget_limit_usd": budget_limit,
        "budget_used_percent": budget_used_pct,
        "budget_status": budget_status,
        "cost_by_model": dict(sorted(by_model.items(), key=lambda x: -x[1])),
        "cost_by_task": dict(sorted(by_task.items(), key=lambda x: -x[1])),
        "costs": [_cost_to_dict(c) for c in costs],
    }


# ── GET /costs/summary ────────────────────────────────────────────────────────

@router.get(
    "/costs/summary",
    summary="Get user's total AI cost summary for the current month",
)
async def get_cost_summary(
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Return the user's total AI spending for the current calendar month,
    broken down by project.

    Helps users track their overall budget usage across all projects.
    """
    # Start of current month
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # All projects owned by user
    projects_result = await db.execute(
        select(Project.id, Project.name).where(
            Project.user_id == current_user.id,
        )
    )
    projects = {str(row[0]): row[1] for row in projects_result.all()}

    if not projects:
        return {
            "month": now.strftime("%Y-%m"),
            "total_cost_usd": 0.0,
            "project_count": 0,
            "projects": [],
        }

    project_ids = list(projects.keys())

    # Get all costs for this month across all user projects
    costs_result = await db.execute(
        select(
            func.cast(Cost.project_id, __import__("sqlalchemy").String).label("pid"),
            func.sum(Cost.cost_usd).label("total"),
            func.count().label("call_count"),
        )
        .where(
            Cost.project_id.in_([uuid.UUID(pid) for pid in project_ids]),
            Cost.created_at >= month_start,
        )
        .group_by(Cost.project_id)
    )

    project_costs = []
    grand_total = 0.0
    cost_rows = {str(row[0]): (float(row[1]), int(row[2])) for row in costs_result.all()}

    for pid, pname in projects.items():
        total_usd, call_count = cost_rows.get(pid, (0.0, 0))
        grand_total += total_usd
        project_costs.append({
            "project_id": pid,
            "project_name": pname,
            "total_cost_usd": round(total_usd, 4),
            "api_call_count": call_count,
        })

    # Sort by cost descending
    project_costs.sort(key=lambda x: -x["total_cost_usd"])

    log.info(
        "cost_summary_fetched",
        user_id=str(current_user.id),
        month=now.strftime("%Y-%m"),
        total_usd=round(grand_total, 4),
    )
    return {
        "month": now.strftime("%Y-%m"),
        "total_cost_usd": round(grand_total, 4),
        "project_count": len(projects),
        "estimated_per_hour_video": 0.14,  # ~$0.14/hr typical
        "projects": project_costs,
    }
