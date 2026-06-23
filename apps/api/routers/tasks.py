"""
ViraEdit — Celery task status router.

GET /api/v1/tasks/{task_id} — poll background job status (style extract, etc.)
"""
from __future__ import annotations

from typing import Any

import structlog
from celery.result import AsyncResult
from fastapi import APIRouter, HTTPException, status

from celery_app import celery_app
from dependencies import CurrentUser

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"])
log = structlog.get_logger("viraedit.tasks")


def _map_celery_state(state: str) -> str:
    """Map Celery state to a frontend-friendly status string."""
    return {
        "PENDING": "pending",
        "STARTED": "processing",
        "PROGRESS": "processing",
        "SUCCESS": "success",
        "FAILURE": "failure",
        "RETRY": "processing",
        "REVOKED": "error",
    }.get(state, state.lower())


def _normalize_task_result(raw: Any) -> dict[str, Any]:
    """Unwrap task return value for API response."""
    if isinstance(raw, dict):
        return raw
    if raw is None:
        return {}
    return {"value": raw}


@router.get("/{task_id}", summary="Get Celery task status")
async def get_task_status(
    task_id: str,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Poll a background Celery task by ID.

    Returns status: pending | processing | success | failure | error
    When complete, includes `result` (task return dict) or `error` message.
    """
    if not task_id or len(task_id) < 8:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found.",
        )

    if task_id.startswith("offline-"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Background worker was not running when this task was queued. "
                "Start the Celery worker (scripts\\worker.bat all) and try again."
            ),
        )

    async_result = AsyncResult(task_id, app=celery_app)
    state = async_result.state or "PENDING"
    mapped = _map_celery_state(state)

    response: dict[str, Any] = {
        "task_id": task_id,
        "status": mapped,
        "celery_state": state,
    }

    if state == "SUCCESS":
        result = _normalize_task_result(async_result.result)
        response["result"] = result
        # Tasks may return {status: "failed", error: "..."} without raising
        if result.get("status") == "failed":
            response["status"] = "failure"
            response["error"] = result.get("error") or "Task failed."
    elif state == "FAILURE":
        err = async_result.result
        response["error"] = str(err) if err else "Task failed."
        log.warning("task_failed", task_id=task_id, error=response["error"])
    elif state == "PROGRESS":
        meta = async_result.info
        if isinstance(meta, dict):
            response["progress_percent"] = meta.get("progress_percent", 0)
            response["stage"] = meta.get("stage", "")
            response["message"] = meta.get("message") or meta.get("stage") or "Processing…"
        else:
            response["message"] = "Processing…"
    elif state == "STARTED":
        response["message"] = "Worker is processing this task…"
        response["progress_percent"] = 5
    elif state == "PENDING":
        response["message"] = "Task is queued — waiting for worker pickup."

    return response
