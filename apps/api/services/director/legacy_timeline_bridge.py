"""Bridge legacy editor timeline JSON → DirectorTimeline via remotion-service."""
from __future__ import annotations

from typing import Any

import httpx
import structlog

from config import settings

log = structlog.get_logger("viraedit.director.legacy_bridge")

BRIDGE_ENDPOINT = "/director/bridge-editor-timeline"


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
    url = f"{settings.REMOTION_SERVICE_URL.rstrip('/')}{BRIDGE_ENDPOINT}"
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=5.0, read=60.0, write=30.0, pool=5.0),
        ) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            result = resp.json()
    except httpx.HTTPStatusError as exc:
        body = exc.response.text[:2000] if exc.response is not None else ""
        log.error(
            "editor_timeline_bridge_http_failed",
            project_id=project_id,
            step="remotion_http",
            status_code=exc.response.status_code if exc.response is not None else None,
            response_body=body,
            error=str(exc),
        )
        raise RuntimeError(
            f"Editor timeline bridge HTTP {exc.response.status_code if exc.response else '?'} "
            f"at {BRIDGE_ENDPOINT}: {body or exc}"
        ) from exc
    except httpx.RequestError as exc:
        log.error(
            "editor_timeline_bridge_unreachable",
            project_id=project_id,
            step="remotion_connect",
            remotion_url=settings.REMOTION_SERVICE_URL,
            error=str(exc),
        )
        raise RuntimeError(
            f"Remotion service unreachable at {settings.REMOTION_SERVICE_URL}: {exc}"
        ) from exc

    if not result.get("success"):
        step = result.get("step", "bridge_timeline")
        err = result.get("error", "unknown error")
        log.error(
            "editor_timeline_bridge_script_failed",
            project_id=project_id,
            step=step,
            error=err,
        )
        raise RuntimeError(f"Editor timeline bridge failed at {step}: {err}")

    timeline = result.get("timeline")
    if not isinstance(timeline, dict):
        log.error(
            "editor_timeline_bridge_empty_payload",
            project_id=project_id,
            step="validate_response",
        )
        raise RuntimeError("Bridge returned no timeline payload.")
    log.info(
        "editor_timeline_bridged",
        project_id=project_id,
        video_clips=len(timeline.get("tracks", {}).get("video", [])),
        motion_graphics=len(timeline.get("tracks", {}).get("motionGraphics", [])),
        vfx=len(timeline.get("tracks", {}).get("vfx", [])),
    )
    return timeline
