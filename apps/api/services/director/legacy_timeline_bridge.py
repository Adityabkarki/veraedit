"""Bridge legacy editor timeline JSON → DirectorTimeline via remotion-service."""
from __future__ import annotations

from typing import Any

import httpx
import structlog

from config import settings

log = structlog.get_logger("viraedit.director.legacy_bridge")


async def bridge_editor_timeline_to_director(
    timeline_data: dict[str, Any],
    *,
    project_id: str,
    fps: int = 30,
    width: int = 1920,
    height: int = 1080,
    content_type: str = "podcast",
    theme: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Convert saved editor timeline (timelines table) into DirectorTimeline JSON.
    Uses remotion-service POST /director/bridge-editor-timeline.
    """
    payload = {
        "timeline": timeline_data,
        "projectId": project_id,
        "fps": fps,
        "width": width,
        "height": height,
        "contentType": content_type,
        "theme": theme,
    }
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(connect=5.0, read=60.0, write=30.0, pool=5.0),
    ) as client:
        resp = await client.post(
            f"{settings.REMOTION_SERVICE_URL.rstrip('/')}/director/bridge-editor-timeline",
            json=payload,
        )
        resp.raise_for_status()
        result = resp.json()
        if not result.get("success"):
            raise RuntimeError(
                f"Editor timeline bridge failed: {result.get('error', 'unknown error')}",
            )
        timeline = result.get("timeline")
        if not isinstance(timeline, dict):
            raise RuntimeError("Bridge returned no timeline payload.")
        log.info(
            "editor_timeline_bridged",
            project_id=project_id,
            video_clips=len(timeline.get("tracks", {}).get("video", [])),
            motion_graphics=len(timeline.get("tracks", {}).get("motionGraphics", [])),
            vfx=len(timeline.get("tracks", {}).get("vfx", [])),
        )
        return timeline
