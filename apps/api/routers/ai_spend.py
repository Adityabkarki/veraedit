"""
ViraEdit — Live AI spend API (Phase 07).

GET /api/v1/ai-spend/project/{project_id}
GET /api/v1/ai-spend/workspace/{workspace_id}
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import structlog
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from config import settings
from dependencies import CurrentUser, DbDep
from models import Project
from models.ai_spend import AISpendRecord

router = APIRouter(prefix="/api/v1/ai-spend", tags=["ai-spend"])
log = structlog.get_logger("viraedit.ai_spend")


async def _verify_project_access(project_id: str, db, current_user) -> None:
    try:
        pid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Project not found.")
    result = await db.execute(
        select(Project).where(Project.id == pid, Project.user_id == current_user.id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Project not found.")


@router.get("/project/{project_id}")
async def get_project_spend(
    project_id: str,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """Live running total + breakdown for a single project."""
    await _verify_project_access(project_id, db, current_user)

    result = await db.execute(
        select(AISpendRecord).where(AISpendRecord.project_id == project_id)
    )
    records = result.scalars().all()
    total = sum(r.cost_usd for r in records)

    by_action: dict[str, float] = {}
    for record in records:
        by_action[record.action] = by_action.get(record.action, 0.0) + record.cost_usd

    budget_limit = settings.AI_COST_LIMIT_USD_PER_HOUR
    budget_used_pct = round((total / budget_limit) * 100, 1) if budget_limit > 0 else 0.0

    return {
        "project_id": project_id,
        "total_usd": round(total, 4),
        "total_cost_usd": round(total, 4),
        "by_action": {k: round(v, 4) for k, v in by_action.items()},
        "call_count": len(records),
        "row_count": len(records),
        "budget_used_percent": budget_used_pct,
    }


@router.get("/workspace/{workspace_id}")
async def get_workspace_spend(
    workspace_id: str,
    db: DbDep,
    current_user: CurrentUser,
    period_days: int = Query(30, ge=1, le=365),
) -> dict:
    """Aggregate spend for a workspace (user id) over a period."""
    if str(current_user.id) != workspace_id:
        raise HTTPException(status_code=404, detail="Workspace not found.")

    cutoff = datetime.now(timezone.utc) - timedelta(days=period_days)
    result = await db.execute(
        select(AISpendRecord).where(
            AISpendRecord.workspace_id == workspace_id,
            AISpendRecord.created_at >= cutoff,
        )
    )
    records = result.scalars().all()
    total = sum(r.cost_usd for r in records)

    by_provider: dict[str, float] = {}
    by_action: dict[str, float] = {}
    for record in records:
        by_provider[record.provider] = by_provider.get(record.provider, 0.0) + record.cost_usd
        by_action[record.action] = by_action.get(record.action, 0.0) + record.cost_usd

    log.info(
        "workspace_spend_fetched",
        workspace_id=workspace_id,
        total_usd=round(total, 4),
        period_days=period_days,
    )
    return {
        "workspace_id": workspace_id,
        "total_usd": round(total, 4),
        "by_provider": {k: round(v, 4) for k, v in by_provider.items()},
        "by_action": {k: round(v, 4) for k, v in by_action.items()},
        "call_count": len(records),
        "period_days": period_days,
    }
