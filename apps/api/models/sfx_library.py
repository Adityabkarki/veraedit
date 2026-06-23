"""Built-in royalty-free SFX catalog (Mixkit + bundled files)."""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import String, Integer, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel


class SfxLibraryItem(BaseModel):
    __tablename__ = "sfx_library"

    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    category: Mapped[str] = mapped_column(String(32), index=True)
    file_name: Mapped[str] = mapped_column(String(128))
    duration_ms: Mapped[int] = mapped_column(Integer, default=300)
    mixkit_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    license_name: Mapped[str] = mapped_column(String(64), default="Mixkit")
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[Optional[list[str]]] = mapped_column(ARRAY(String), nullable=True)
    tool_ids: Mapped[Optional[list[str]]] = mapped_column(ARRAY(String), nullable=True)

    def to_dict(self, *, public_base_url: str = "/sfx") -> dict:
        return {
            "id": str(self.id),
            "slug": self.slug,
            "name": self.name,
            "category": self.category,
            "file_name": self.file_name,
            "duration_ms": self.duration_ms,
            "preview_url": f"{public_base_url.rstrip('/')}/{self.file_name}",
            "tags": self.tags or [],
            "tool_ids": self.tool_ids or [],
            "license": self.license_name,
        }
