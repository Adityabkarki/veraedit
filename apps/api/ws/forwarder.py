"""
Redis → WebSocket forwarder.

Subscribes to project channels and broadcasts to in-process connections.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from ws.manager import ConnectionManager

log = logging.getLogger("viraedit.ws.forwarder")


async def run_redis_forwarder(redis_client: Any, manager: ConnectionManager) -> None:
    """
    Background task: listen on Redis pub/sub and forward to WebSockets.

    Uses pattern subscribe on viraedit:ws:project:* channels.
    """
    if redis_client is None:
        log.warning("ws_forwarder_skipped: redis unavailable")
        return

    pubsub = redis_client.pubsub()
    pattern = "viraedit:ws:project:*"
    await pubsub.psubscribe(pattern)
    log.info("ws_forwarder_started: pattern=%s", pattern)

    try:
        while True:
            message = await pubsub.get_message(
                ignore_subscribe_messages=True,
                timeout=1.0,
            )
            if not message or message.get("type") != "pmessage":
                await asyncio.sleep(0.05)
                continue

            channel = str(message.get("channel", ""))
            raw = message.get("data")
            if not raw:
                continue

            # channel format: viraedit:ws:project:{uuid}
            project_id = channel.rsplit(":", 1)[-1]
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                log.warning("ws_forwarder_bad_json: channel=%s", channel)
                continue

            count = await manager.broadcast(project_id, payload)
            if count:
                log.debug(
                    "ws_forwarded: project=%s type=%s clients=%d",
                    project_id,
                    payload.get("type"),
                    count,
                )
    except asyncio.CancelledError:
        log.info("ws_forwarder_stopping")
        raise
    finally:
        try:
            await pubsub.punsubscribe(pattern)
            await pubsub.aclose()
        except Exception as exc:
            log.warning("ws_forwarder_cleanup_failed: %s", exc)
