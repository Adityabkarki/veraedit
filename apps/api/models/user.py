"""
ViraEdit — User model.
Users own projects, brands, and exports.
"""
import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .asset_library import LibraryAsset
    from .brand import Brand
    from .project import Project


class User(BaseModel):
    __tablename__ = "users"

    # Auth
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # Profile
    display_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    avatar_storage_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Account state
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Preferences stored as JSON string for now (Pydantic will parse)
    preferences: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON

    # Relationships
    projects: Mapped[List["Project"]] = relationship(
        "Project", back_populates="user", cascade="all, delete-orphan"
    )
    brands: Mapped[List["Brand"]] = relationship(
        "Brand", back_populates="user", cascade="all, delete-orphan"
    )
    library_assets: Mapped[List["LibraryAsset"]] = relationship(
        "LibraryAsset", back_populates="user", cascade="all, delete-orphan"
    )
