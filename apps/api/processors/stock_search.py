"""
ViraEdit — Stock footage search for B-roll.

Searches Pexels for free stock videos matching a query.
Returns results with thumbnail, video URL, duration, and resolution.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import httpx
import structlog

from config import settings

log = structlog.get_logger("viraedit.processors.stock_search")

PEXELS_API_URL = "https://api.pexels.com/videos/search"
PEXELS_PHOTO_URL = "https://api.pexels.com/v1/search"
TIMEOUT_S = 15


@dataclass
class StockVideoResult:
    id: int
    duration: float
    thumbnail_url: str
    video_url: str
    width: int
    height: int
    provider: str = "pexels"

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "duration": self.duration,
            "thumbnail_url": self.thumbnail_url,
            "video_url": self.video_url,
            "width": self.width,
            "height": self.height,
            "provider": self.provider,
        }


def search_pexels(query: str, count: int = 6, orientation: str = "portrait") -> list[dict[str, Any]]:
    """
    Search Pexels for stock videos matching the query.

    Args:
        query:       Search term (e.g. "nature", "office work", "technology").
        count:       Max results to return (default 6).
        orientation: "portrait" (9:16), "landscape" (16:9), or "square" (1:1).

    Returns:
        List of StockVideoResult dicts, sorted by relevance.
    """
    api_key = settings.PEXELS_API_KEY
    if not api_key:
        log.warning("pexels_skipped_no_api_key")
        return []

    try:
        resp = httpx.get(
            PEXELS_API_URL,
            headers={"Authorization": api_key},
            params={
                "query": query,
                "per_page": min(count, 15),
                "orientation": orientation,
                "size": "medium",
            },
            timeout=TIMEOUT_S,
        )
        if resp.status_code != 200:
            log.warning("pexels_api_error", status=resp.status_code, body=resp.text[:200])
            return []

        data = resp.json()
        videos = data.get("videos", [])
        results: list[StockVideoResult] = []
        for v in videos:
            files = v.get("video_files", [])
            if not files:
                continue
            # Prefer HD quality, fall back to first available
            hd = next((f for f in files if f.get("quality") in ("hd", "hdr")), files[0])
            if not hd or not hd.get("link"):
                continue
            results.append(StockVideoResult(
                id=int(v["id"]),
                duration=float(v.get("duration", 5)),
                thumbnail_url=str(v.get("image", "")),
                video_url=str(hd["link"]),
                width=int(hd.get("width", 1920)),
                height=int(hd.get("height", 1080)),
            ))

        results.sort(key=lambda r: r.duration)

        log.info("pexels_search_complete", query=query, count=len(results))
        return [r.to_dict() for r in results]

    except httpx.TimeoutException:
        log.warning("pexels_timeout", query=query)
        return []
    except Exception as exc:
        log.warning("pexels_search_failed", query=query, error=str(exc))
        return []


def search_stock(
    query: str,
    count: int = 6,
    orientation: str = "portrait",
) -> list[dict[str, Any]]:
    """
    Unified stock search entry point.

    Currently supports Pexels only. Other providers (Pixabay, Unsplash)
    can be added here in the future.
    """
    return search_pexels(query, count, orientation)
