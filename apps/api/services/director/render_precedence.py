"""Director render path precedence — compiled timeline vs editor bridge."""
from __future__ import annotations

from typing import Any


def project_uses_director_engine(settings: dict[str, Any] | None) -> bool:
    settings = settings or {}
    return bool(settings.get("useDirectorEngine") or settings.get("use_director_engine"))


def should_use_compiled_director_timeline(
    *,
    settings: dict[str, Any] | None,
    compiled_timeline: dict[str, Any] | None,
) -> bool:
    """
    Director Timeline Primacy: when a compiled DirectorTimeline exists and the
    project flag is on, it is the sole render source. No merge with bridged data.
    useDirectorEngine=false forces the bridge/legacy branch even if compiled exists.
    """
    return bool(compiled_timeline and project_uses_director_engine(settings))


FALLBACK_USER_MESSAGE = (
    "Export fell back to basic rendering — Director styling failed. "
    "See render details for the technical reason."
)
