"""
ViraEdit — AI B-Roll router.

Endpoints:
  POST   /projects/{id}/broll/reanalyze        — Re-run B-roll suggestion engine
  POST   /projects/{id}/broll/generate          — Start AI B-roll generation
  POST   /projects/{id}/broll/search-stock      — Search stock footage
  POST   /projects/{id}/broll/use-stock          — Use selected stock video
  POST   /projects/{id}/broll/batch-generate     — Process multiple suggestions at once
  POST   /projects/{id}/broll/fill-dead-air      — Auto-fill dead air with stock footage
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from config import settings
from dependencies import CurrentUser, DbDep
from models import Project, Suggestion, User

log = structlog.get_logger("viraedit.routers.broll")

router = APIRouter(
    prefix="/api/v1/projects/{project_id}/broll",
    tags=["broll"],
)





# ── Dependencies ──────────────────────────────────────────────────────────────

async def _get_project(project_id: uuid.UUID, current_user: object, db: DbDep) -> Project:
    from sqlalchemy import select
    user_id = current_user.id if hasattr(current_user, "id") else current_user
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == user_id,
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _get_suggestion(suggestion_id: str, project_id: uuid.UUID, db: DbDep) -> Suggestion:
    from sqlalchemy import select
    result = await db.execute(
        select(Suggestion).where(
            Suggestion.id == suggestion_id,
            Suggestion.project_id == project_id,
        )
    )
    sug = result.scalar_one_or_none()
    if not sug:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    return sug


# ── Schemas ───────────────────────────────────────────────────────────────────

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    suggestion_id: str
    prompt: str
    start_time: float = Field(..., ge=0)
    end_time: float = Field(..., ge=0)
    broll_reason: str = "explanation"


class SearchStockRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=200)
    count: int = Field(default=6, ge=1, le=20)
    orientation: str = Field(default="portrait", pattern=r"^(portrait|landscape|square)$")


class ReanalyzeRequest(BaseModel):
    asset_id: str = Field(..., min_length=8)


class UseStockRequest(BaseModel):
    suggestion_id: str
    stock_url: str = Field(..., min_length=5)
    prompt: str = Field(default="", max_length=500)
    start_time: float = Field(..., ge=0)
    end_time: float = Field(..., ge=0)
    broll_reason: str = "explanation"


class BatchGenerateRequest(BaseModel):
    suggestion_ids: list[str] = Field(
        default_factory=list,
        description="List of suggestion IDs to process. Empty = all pending.",
    )
    strategy: str = Field(
        default="prefer_stock",
        pattern=r"^(prefer_stock|prefer_ai|all_stock|all_ai)$",
        description=(
            "prefer_stock = search Pexels first, fall back to AI generation; "
            "prefer_ai = AI image first, fall back to stock; "
            "all_stock / all_ai = only that source."
        ),
    )


class FillDeadAirRequest(BaseModel):
    max_suggestions: int = Field(default=5, ge=1, le=20)
    strategy: str = Field(
        default="prefer_stock",
        pattern=r"^(prefer_stock|prefer_ai|all_stock|all_ai)$",
    )


class DirectStockInsertRequest(BaseModel):
    stock_url: str = Field(..., min_length=5)
    prompt: str = Field(default="", max_length=500)
    start_time: float = Field(default=0, ge=0)
    end_time: float = Field(default=4.0, ge=0)
    broll_reason: str = Field(default="explanation", max_length=100)


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/reanalyze")
async def reanalyze_broll(
    project_id: uuid.UUID,
    body: ReanalyzeRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Re-run the B-roll suggestion engine on the existing transcript.

    Uses GPT-4o-mini to re-scan the transcript and generate fresh B-roll
    suggestions. Old suggestions for this asset are replaced.
    """
    await _get_project(project_id, current_user, db)

    from sqlalchemy import select, delete as sa_delete, and_
    from models import Asset, Suggestion, Transcript

    # 1. Get asset
    asset_result = await db.execute(
        select(Asset).where(
            Asset.id == body.asset_id,
            Asset.project_id == project_id,
        )
    )
    asset = asset_result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    duration = asset.duration_seconds or 0.0
    if duration <= 0:
        raise HTTPException(status_code=400, detail="Asset has no duration — upload a video first.")

    # 2. Get transcript
    transcript_result = await db.execute(
        select(Transcript).where(Transcript.asset_id == body.asset_id)
    )
    transcript = transcript_result.scalar_one_or_none()
    if not transcript or transcript.status != "ready":
        raise HTTPException(
            status_code=400,
            detail="Transcript not ready. Wait for transcription to complete.",
        )

    full_text = transcript.full_text or ""
    words = transcript.words or []
    if not full_text.strip():
        raise HTTPException(status_code=400, detail="Transcript is empty. Re-transcribe the video.")

    # 3. Run suggestion engine (offloaded to thread — AI call is sync)
    from tasks.broll_suggestion import run_broll_suggestion_engine

    broll_actions = await asyncio.to_thread(run_broll_suggestion_engine, full_text, words, duration)
    if not broll_actions:
        return {"status": "ok", "broll_count": 0, "message": "No B-roll opportunities found."}

    # 4. Delete old broll suggestions for this asset
    await db.execute(
        sa_delete(Suggestion).where(
            and_(
                Suggestion.asset_id == body.asset_id,
                Suggestion.type == "VISUAL_OPPORTUNITY",
                Suggestion.action["suggested_visual"].astext == "ai_broll",
            )
        )
    )

    # 5. Insert new suggestions
    import uuid as _uuid

    for ba in broll_actions:
        confidence = float(ba.get("confidence", 0.7))
        display_val = ba.get("display_value", "B-roll")
        db.add(Suggestion(
            project_id=project_id,
            asset_id=uuid.UUID(body.asset_id),
            type="VISUAL_OPPORTUNITY",
            title=f"B-Roll: {display_val}",
            description=(
                f"Insert B-roll at {ba.get('start_time', 0):.1f}s "
                f"— {ba.get('broll_reason', 'visual enhancement')}"
            ),
            action=ba,
            confidence=confidence,
            start_time=ba.get("start_time"),
            end_time=ba.get("end_time"),
        ))

    await db.commit()

    log.info("broll_reanalyze_complete",
             project_id=str(project_id),
             asset_id=body.asset_id,
             count=len(broll_actions))

    return {
        "status": "ok",
        "broll_count": len(broll_actions),
        "message": f"Generated {len(broll_actions)} B-roll suggestion(s).",
    }

@router.post("/generate")
async def generate_broll(
    project_id: uuid.UUID,
    body: GenerateRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Start AI B-roll image generation for a suggestion.

    Returns a task_id that can be polled via the suggestions endpoint
    (check `action.generation_status` field).
    """
    await _get_project(project_id, current_user, db)
    sug = await _get_suggestion(body.suggestion_id, project_id, db)

    # Mark as generating
    import json as j
    action = dict(sug.action or {})
    action.update({"generation_status": "queued"})
    sug.action = action
    await db.commit()

    # Launch Celery task
    from tasks.broll_generation import generate_and_insert_broll

    async_result = generate_and_insert_broll.delay(
        project_id=str(project_id),
        asset_id=str(sug.asset_id),
        suggestion_id=body.suggestion_id,
        prompt=body.prompt,
        broll_reason=body.broll_reason,
        timeline_start=body.start_time,
        timeline_end=body.end_time,
    )

    log.info("broll_generate_queued",
             project_id=str(project_id),
             suggestion_id=body.suggestion_id,
             task_id=async_result.id)

    return {
        "status": "queued",
        "task_id": async_result.id,
        "suggestion_id": body.suggestion_id,
        "message": "B-roll generation started. Check suggestion status via GET /broll-suggestions",
    }


@router.post("/search-stock")
async def search_stock(
    project_id: uuid.UUID,
    body: SearchStockRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Search stock footage (Pexels) for B-roll.

    Requires PEXELS_API_KEY to be configured. Returns up to `count` results.
    """
    await _get_project(project_id, current_user, db)

    if not settings.PEXELS_API_KEY:
        raise HTTPException(
            status_code=501,
            detail="Stock search is not configured. Add PEXELS_API_KEY to your .env file.",
        )

    from processors.stock_search import search_stock
    results = search_stock(body.query, body.count, body.orientation)

    return {
        "status": "ok",
        "query": body.query,
        "count": len(results),
        "results": results,
    }


@router.post("/use-stock")
async def use_stock_video(
    project_id: uuid.UUID,
    body: UseStockRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Download a selected stock video and insert as B-roll on the timeline.

    The stock video URL (from search-stock results) is downloaded,
    uploaded to MinIO, and inserted as an overlay clip.
    """
    await _get_project(project_id, current_user, db)
    sug = await _get_suggestion(body.suggestion_id, project_id, db)

    import json as j
    action = dict(sug.action or {})
    action.update({"generation_status": "queued"})
    sug.action = action
    await db.commit()

    from tasks.broll_generation import insert_stock_broll

    async_result = insert_stock_broll.delay(
        project_id=str(project_id),
        asset_id=str(sug.asset_id),
        suggestion_id=body.suggestion_id,
        stock_url=body.stock_url,
        prompt=body.prompt or "Stock B-roll",
        broll_reason=body.broll_reason,
        timeline_start=body.start_time,
        timeline_end=body.end_time,
    )

    log.info("stock_broll_queued",
             project_id=str(project_id),
             suggestion_id=body.suggestion_id,
             task_id=async_result.id)

    return {
        "status": "queued",
        "task_id": async_result.id,
        "suggestion_id": body.suggestion_id,
        "message": "Stock B-roll download started. Check suggestion status via GET /broll-suggestions",
    }


@router.post("/batch-generate")
async def batch_generate_broll(
    project_id: uuid.UUID,
    body: BatchGenerateRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Process multiple B-roll suggestions at once.

    When `suggestion_ids` is empty, all pending suggestions for the
    project's primary asset are processed. The `strategy` field controls
    whether to prefer AI image generation or stock footage search.

    Returns a list of `{ suggestion_id, task_id, method }` so the
    frontend can poll each one individually.
    """
    await _get_project(project_id, current_user, db)

    from sqlalchemy import select, and_
    from models import Asset, Suggestion

    # 1. Find the primary asset for this project
    asset_result = await db.execute(
        select(Asset).where(
            Asset.project_id == project_id,
            Asset.status == "ready",
        ).order_by(Asset.created_at.desc()).limit(1)
    )
    asset = asset_result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="No ready asset found for this project.")

    # 2. Fetch suggestions
    query = select(Suggestion).where(
        Suggestion.asset_id == asset.id,
        Suggestion.type == "VISUAL_OPPORTUNITY",
        Suggestion.action["suggested_visual"].astext == "ai_broll",
    )
    if body.suggestion_ids:
        query = query.where(Suggestion.id.in_(body.suggestion_ids))
    else:
        query = query.where(
            and_(
                ~Suggestion.action["generation_status"].astext.in_(["generated", "generating_image", "queued"]),
                Suggestion.action["generation_status"].is_(None) |
                (Suggestion.action["generation_status"].astext == "pending") |
                (Suggestion.action["generation_status"].astext == "error"),
            )
        )
    query = query.order_by(Suggestion.start_time.asc())

    result = await db.execute(query)
    suggestions = result.scalars().all()

    if not suggestions:
        return {
            "status": "ok",
            "total": 0,
            "tasks": [],
            "message": "No pending suggestions to process.",
        }

    from tasks.broll_generation import generate_and_insert_broll, insert_stock_broll

    tasks = []
    strategy = body.strategy

    for sug in suggestions:
        action = dict(sug.action or {})
        prompt = action.get("broll_prompt", "")
        broll_reason = action.get("broll_reason", "explanation")
        start_time = float(action.get("start_time", 0) or sug.start_time or 0)
        end_time = float(action.get("end_time", start_time + 4) or sug.end_time or (start_time + 4))

        # Mark as queued
        action["generation_status"] = "queued"
        sug.action = action

        # Choose method based on strategy
        use_stock = strategy in ("prefer_stock", "all_stock")
        use_ai = strategy in ("prefer_ai", "all_ai")

        if strategy == "prefer_stock":
            use_stock = bool(settings.PEXELS_API_KEY)
            use_ai = True
        elif strategy == "prefer_ai":
            use_ai = True
            use_stock = bool(settings.OPENAI_API_KEY or settings.GEMINI_API_KEY)

        if use_stock and not use_ai:
            # Stock search needs a search term; use the prompt
            from processors.stock_search import search_stock
            stock_results = search_stock(query=prompt, count=3, orientation="landscape")
            if stock_results:
                stock_url = stock_results[0]["video_url"]
                async_result = insert_stock_broll.delay(
                    project_id=str(project_id),
                    asset_id=str(sug.asset_id),
                    suggestion_id=str(sug.id),
                    stock_url=stock_url,
                    prompt=prompt,
                    broll_reason=broll_reason,
                    timeline_start=start_time,
                    timeline_end=end_time,
                )
                tasks.append({
                    "suggestion_id": str(sug.id),
                    "task_id": async_result.id,
                    "method": "stock",
                })
            elif use_ai:
                async_result = generate_and_insert_broll.delay(
                    project_id=str(project_id),
                    asset_id=str(sug.asset_id),
                    suggestion_id=str(sug.id),
                    prompt=prompt,
                    broll_reason=broll_reason,
                    timeline_start=start_time,
                    timeline_end=end_time,
                )
                tasks.append({
                    "suggestion_id": str(sug.id),
                    "task_id": async_result.id,
                    "method": "ai_generated",
                })
        elif use_ai:
            async_result = generate_and_insert_broll.delay(
                project_id=str(project_id),
                asset_id=str(sug.asset_id),
                suggestion_id=str(sug.id),
                prompt=prompt,
                broll_reason=broll_reason,
                timeline_start=start_time,
                timeline_end=end_time,
            )
            tasks.append({
                "suggestion_id": str(sug.id),
                "task_id": async_result.id,
                "method": "ai_generated",
            })

    await db.commit()

    log.info("batch_generate_complete",
             project_id=str(project_id),
             total=len(suggestions),
             launched=len(tasks),
             strategy=strategy)

    return {
        "status": "ok",
        "total": len(suggestions),
        "launched": len(tasks),
        "tasks": tasks,
        "message": f"Launched {len(tasks)} B-roll generation task(s).",
    }


@router.post("/fill-dead-air")
async def fill_dead_air(
    project_id: uuid.UUID,
    body: FillDeadAirRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Auto-fill dead-air segments with stock footage or AI-generated B-roll.

    Scans all 'dead_air' suggestions for the project's primary asset and
    launches generation tasks for each one using the chosen strategy.

    This saves the user from manually clicking each dead-air card.
    """
    await _get_project(project_id, current_user, db)

    from sqlalchemy import select, and_
    from models import Asset, Suggestion

    asset_result = await db.execute(
        select(Asset).where(
            Asset.project_id == project_id,
            Asset.status == "ready",
        ).order_by(Asset.created_at.desc()).limit(1)
    )
    asset = asset_result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="No ready asset found.")

    result = await db.execute(
        select(Suggestion).where(
            Suggestion.asset_id == asset.id,
            Suggestion.type == "VISUAL_OPPORTUNITY",
            Suggestion.action["suggested_visual"].astext == "ai_broll",
            Suggestion.action["broll_reason"].astext == "dead_air",
            and_(
                ~Suggestion.action["generation_status"].astext.in_(["generated", "generating_image", "queued"]),
                Suggestion.action["generation_status"].is_(None) |
                (Suggestion.action["generation_status"].astext == "pending") |
                (Suggestion.action["generation_status"].astext == "error"),
            ),
        ).order_by(Suggestion.start_time.asc()).limit(body.max_suggestions)
    )
    suggestions = result.scalars().all()

    if not suggestions:
        return {
            "status": "ok",
            "total": 0,
            "tasks": [],
            "message": "No dead-air segments to fill.",
        }

    from tasks.broll_generation import insert_stock_broll

    tasks = []
    for sug in suggestions:
        action = dict(sug.action or {})
        prompt = action.get("broll_prompt", "B-roll")
        broll_reason = "dead_air"
        start_time = float(action.get("start_time", 0) or sug.start_time or 0)
        end_time = float(action.get("end_time", start_time + 4) or sug.end_time or (start_time + 4))

        action["generation_status"] = "queued"
        sug.action = action

        # Try stock first for dead air (quickest)
        stock_url = None
        if settings.PEXELS_API_KEY:
            from processors.stock_search import search_stock
            stock_results = search_stock(query=prompt, count=1, orientation="landscape")
            if stock_results:
                stock_url = stock_results[0]["video_url"]

        if stock_url:
            async_result = insert_stock_broll.delay(
                project_id=str(project_id),
                asset_id=str(sug.asset_id),
                suggestion_id=str(sug.id),
                stock_url=stock_url,
                prompt=prompt,
                broll_reason=broll_reason,
                timeline_start=start_time,
                timeline_end=end_time,
            )
            method = "stock"
        elif settings.OPENAI_API_KEY or settings.GEMINI_API_KEY:
            from tasks.broll_generation import generate_and_insert_broll
            async_result = generate_and_insert_broll.delay(
                project_id=str(project_id),
                asset_id=str(sug.asset_id),
                suggestion_id=str(sug.id),
                prompt=prompt,
                broll_reason=broll_reason,
                timeline_start=start_time,
                timeline_end=end_time,
            )
            method = "ai_generated"
        else:
            continue

        tasks.append({
            "suggestion_id": str(sug.id),
            "task_id": async_result.id,
            "method": method,
        })

    await db.commit()

    log.info("dead_air_fill_complete",
             project_id=str(project_id),
             filled=len(tasks))

    return {
        "status": "ok",
        "total": len(suggestions),
        "filled": len(tasks),
        "tasks": tasks,
        "message": f"Filling {len(tasks)} dead-air segment(s) with B-roll.",
    }


@router.post("/insert-stock")
async def insert_stock_direct(
    project_id: uuid.UUID,
    body: DirectStockInsertRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Directly insert a stock video at a given timeline position without a
    pre-existing suggestion. Useful for the "Search Stock" entry point from
    the empty state or the batch action bar.
    """
    project = await _get_project(project_id, current_user, db)

    from sqlalchemy import select
    from models import Asset

    asset_result = await db.execute(
        select(Asset).where(
            Asset.project_id == project_id,
            Asset.status == "ready",
        ).order_by(Asset.created_at.desc()).limit(1)
    )
    asset = asset_result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="No ready asset found for this project.")

    from tasks.broll_generation import insert_stock_broll

    async_result = insert_stock_broll.delay(
        project_id=str(project_id),
        asset_id=str(asset.id),
        suggestion_id=None,
        stock_url=body.stock_url,
        prompt=body.prompt or "Stock B-roll",
        broll_reason=body.broll_reason,
        timeline_start=body.start_time,
        timeline_end=body.end_time,
    )

    log.info("stock_broll_direct_queued",
             project_id=str(project_id),
             task_id=async_result.id,
             start_time=body.start_time)

    return {
        "status": "queued",
        "task_id": async_result.id,
        "message": "Stock B-roll insertion started.",
    }
