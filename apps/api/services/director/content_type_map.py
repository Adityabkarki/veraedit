"""Map project ContentType → Director Engine content pillar."""
from __future__ import annotations

from models.project import ContentType

DIRECTOR_CONTENT_TYPES = frozenset({"podcast", "consultancy", "social", "showcase"})

_PROJECT_TO_DIRECTOR: dict[ContentType, str] = {
    ContentType.PODCAST: "podcast",
    ContentType.INTERVIEW: "podcast",
    ContentType.TUTORIAL: "consultancy",
    ContentType.VLOG: "social",
    ContentType.SHORTS: "social",
    ContentType.OTHER: "podcast",
}

_ASPECT_BY_DIRECTOR: dict[str, tuple[int, int]] = {
    "podcast": (1920, 1080),
    "consultancy": (1920, 1080),
    "social": (1080, 1920),
    "showcase": (1920, 1080),
}


def resolve_director_content_type(
    *,
    project_content_type: ContentType,
    override: str | None = None,
) -> str:
    if override:
        normalized = override.strip().lower()
        if normalized not in DIRECTOR_CONTENT_TYPES:
            raise ValueError(
                f"Invalid content type '{override}'. "
                f"Expected one of: {', '.join(sorted(DIRECTOR_CONTENT_TYPES))}."
            )
        return normalized
    return _PROJECT_TO_DIRECTOR.get(project_content_type, "podcast")


def default_dimensions(content_type: str) -> tuple[int, int]:
    return _ASPECT_BY_DIRECTOR.get(content_type, (1920, 1080))
