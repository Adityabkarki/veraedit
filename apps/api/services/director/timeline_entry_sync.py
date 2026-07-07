"""Sync denormalized timeline_entry_index from canonical DirectorTimeline JSONB."""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from models.timeline_entry_index import TimelineEntryIndex
from services.director.timeline_window import iter_timeline_entries


async def sync_timeline_entry_index(
    db: AsyncSession,
    timeline_id: uuid.UUID,
    timeline: dict[str, Any],
) -> int:
    """
    Regenerate index rows from canonical JSONB — never call independently of a timeline write.
    """
    await db.execute(
        delete(TimelineEntryIndex).where(TimelineEntryIndex.timeline_id == timeline_id)
    )

    count = 0
    for track_name, entry, start, end in iter_timeline_entries(timeline):
        db.add(
            TimelineEntryIndex(
                timeline_id=timeline_id,
                track_name=track_name,
                entry_id=str(entry.get("id")),
                start_frame=start,
                end_frame=end,
                entry_data=entry,
            )
        )
        count += 1

    return count


async def query_windowed_entries_from_index(
    db: AsyncSession,
    timeline_id: uuid.UUID,
    start_frame: int,
    end_frame: int,
) -> dict[str, list[dict[str, Any]]]:
    """Fast range lookup via indexed table."""
    from sqlalchemy import select

    if start_frame > end_frame:
        start_frame, end_frame = end_frame, start_frame

    result = await db.execute(
        select(TimelineEntryIndex).where(
            TimelineEntryIndex.timeline_id == timeline_id,
            TimelineEntryIndex.end_frame >= start_frame,
            TimelineEntryIndex.start_frame <= end_frame,
        )
    )
    rows = result.scalars().all()
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(row.track_name, []).append(dict(row.entry_data))
    return grouped
