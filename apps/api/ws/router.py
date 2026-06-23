"""
WebSocket router — real-time project events.

Connect:
    ws://localhost:8000/api/v1/ws/projects/{project_id}?token={access_token}

Protocol:
    - Client may send "ping" → server replies {"type": "pong"}
    - Server pushes pipeline/render events as JSON envelopes
"""
from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from auth.jwt import TokenType, decode_token
from database import AsyncSessionLocal
from models import Project
from ws.manager import ws_manager

router = APIRouter(tags=["websocket"])
log = structlog.get_logger("viraedit.ws")


async def _verify_project_access(project_id: uuid.UUID, user_id: str) -> bool:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Project.id).where(
                Project.id == project_id,
                Project.user_id == user_id,
            )
        )
        return result.scalar_one_or_none() is not None


@router.websocket("/api/v1/ws/projects/{project_id}")
async def project_websocket(
    websocket: WebSocket,
    project_id: uuid.UUID,
    token: str = Query(..., description="JWT access token"),
) -> None:
    """
    Subscribe to real-time events for a project.

    Requires a valid access token and project ownership.
    """
    try:
        payload = decode_token(token, expected_type=TokenType.ACCESS)
    except ValueError:
        await websocket.close(code=1008, reason="Invalid token")
        return

    user_id = payload.get("sub")
    if not user_id:
        await websocket.close(code=1008, reason="Invalid token")
        return

    if not await _verify_project_access(project_id, str(user_id)):
        await websocket.close(code=1008, reason="Forbidden")
        return

    pid = str(project_id)
    await ws_manager.connect(pid, websocket)

    # Acknowledge connection
    await websocket.send_json({
        "type": "connected",
        "project_id": pid,
        "message": "Subscribed to project events.",
    })

    try:
        while True:
            raw = await websocket.receive_text()
            if raw.strip().lower() == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect(pid, websocket)
