"""
ViraEdit — Reusable tagged asset library (Phase 00).

LibraryAsset is separate from project-scoped Asset:
  - Asset = raw footage for a specific project
  - LibraryAsset = tagged pool reused across projects for template matching
"""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .user import User


class LibraryAsset(BaseModel):
    __tablename__ = "library_assets"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    storage_key: Mapped[str] = mapped_column(String(1000), nullable=False)
    thumb_key: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    asset_type: Mapped[str] = mapped_column(String(20), nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="uploaded")
    tags: Mapped[dict] = mapped_column(JSONB, nullable=False)
    used_in_templates: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )

    user: Mapped["User"] = relationship("User", back_populates="library_assets")
