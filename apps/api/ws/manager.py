"""
In-process WebSocket connection manager.

Tracks active connections per project and broadcasts JSON events.
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

log = logging.getLogger("viraedit.ws.manager")


class ConnectionManager:
    """Manages WebSocket connections grouped by project_id."""

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    @property
    def connection_count(self) -> int:
        return sum(len(v) for v in self._connections.values())

    async def connect(self, project_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[project_id].add(websocket)
        log.info("ws_connected: project=%s total=%d", project_id, self.connection_count)

    async def disconnect(self, project_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            conns = self._connections.get(project_id)
            if conns:
                conns.discard(websocket)
                if not conns:
                    del self._connections[project_id]
        log.info("ws_disconnected: project=%s total=%d", project_id, self.connection_count)

    async def broadcast(self, project_id: str, message: dict[str, Any]) -> int:
        """Send message to all connections for a project. Returns delivery count."""
        async with self._lock:
            targets = list(self._connections.get(project_id, set()))

        if not targets:
            return 0

        dead: list[WebSocket] = []
        delivered = 0
        for ws in targets:
            try:
                await ws.send_json(message)
                delivered += 1
            except Exception:
                dead.append(ws)

        if dead:
            async with self._lock:
                for ws in dead:
                    self._connections.get(project_id, set()).discard(ws)

        return delivered


# Singleton used by router + Redis forwarder
ws_manager = ConnectionManager()
