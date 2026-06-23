"""
ViraEdit — Brand model.
User's brand kit: colors, fonts, logo, caption style.
Applied to renders to maintain consistent visual identity.
"""
import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .user import User


class Brand(BaseModel):
    __tablename__ = "brands"

    # Ownership
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    logo_storage_key: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)

    # Brand colors
    # {"primary": "#FF6B35", "secondary": "#004E89", "accent": "#1A936F", "background": "#FFFFFF"}
    colors: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Brand fonts (font names must be available on the render system)
    # {"heading": "Noto Sans Devanagari", "body": "Roboto", "caption": "Noto Sans Devanagari"}
    fonts: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Caption rendering style for video output
    # {
    #   "font_size": 72,
    #   "font_color": "#FFFFFF",
    #   "outline_color": "#000000",
    #   "outline_width": 3,
    #   "position": "bottom_center",
    #   "animation": "word_by_word",
    #   "background": "none"
    # }
    caption_style: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Extracted style DNA (from style transfer feature EP-2.8)
    # Contains cut pacing, color grade, transition types, etc.
    style_dna: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Relationship
    user: Mapped["User"] = relationship("User", back_populates="brands")
