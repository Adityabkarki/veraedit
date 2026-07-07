"""Long-form analysis chunk planning (Phase 12)."""
from __future__ import annotations

from dataclasses import dataclass

CHUNK_THRESHOLD_SECONDS = 15 * 60
DEFAULT_CHUNK_TARGET_MINUTES = 9
DEFAULT_OVERLAP_SECONDS = 25


@dataclass(frozen=True)
class ChunkPlan:
    chunk_index: int
    core_start: float
    core_end: float
    window_start: float
    window_end: float

    def to_dict(self) -> dict:
        return {
            "chunkIndex": self.chunk_index,
            "coreStart": self.core_start,
            "coreEnd": self.core_end,
            "windowStart": self.window_start,
            "windowEnd": self.window_end,
        }


def plan_chunks(
    duration_seconds: float,
    *,
    chunk_target_minutes: int = DEFAULT_CHUNK_TARGET_MINUTES,
    overlap_seconds: int = DEFAULT_OVERLAP_SECONDS,
    chunk_threshold_seconds: int = CHUNK_THRESHOLD_SECONDS,
) -> list[ChunkPlan]:
    """Plan overlapping analysis windows for long-form content."""
    duration = max(0.0, float(duration_seconds))
    if duration == 0:
        return [
            ChunkPlan(0, 0.0, 0.0, 0.0, 0.0),
        ]

    if duration <= chunk_threshold_seconds:
        return [
            ChunkPlan(0, 0.0, duration, 0.0, duration),
        ]

    core_length = chunk_target_minutes * 60
    overlap = float(overlap_seconds)
    chunks: list[ChunkPlan] = []
    core_start = 0.0
    chunk_index = 0

    while core_start < duration:
        core_end = min(core_start + core_length, duration)
        chunks.append(
            ChunkPlan(
                chunk_index=chunk_index,
                core_start=core_start,
                core_end=core_end,
                window_start=max(0.0, core_start - overlap),
                window_end=min(duration, core_end + overlap),
            )
        )
        core_start = core_end
        chunk_index += 1

    return chunks


def overlap_zone(left: ChunkPlan, right: ChunkPlan) -> tuple[float, float] | None:
    """Return overlap window between adjacent chunk plans."""
    start = max(left.window_start, right.window_start)
    end = min(left.window_end, right.window_end)
    if end <= start:
        return None
    return start, end
