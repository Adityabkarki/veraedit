"""Unit tests for WebSocket connection manager (EP-6.1)."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

from ws.manager import ConnectionManager


class FakeWebSocket:
    def __init__(self):
        self.sent: list[dict] = []
        self.accepted = False

    async def accept(self):
        self.accepted = True

    async def send_json(self, data: dict):
        self.sent.append(data)


def test_connect_and_broadcast():
    async def _run():
        mgr = ConnectionManager()
        ws = FakeWebSocket()
        await mgr.connect("proj-1", ws)
        assert ws.accepted
        assert mgr.connection_count == 1

        count = await mgr.broadcast("proj-1", {"type": "test"})
        assert count == 1
        assert ws.sent[0]["type"] == "test"

        await mgr.disconnect("proj-1", ws)
        assert mgr.connection_count == 0

    asyncio.run(_run())
