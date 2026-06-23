"""
ViraEdit — Embedding model.
Stores vector embeddings for semantic search.
Uses pgvector for similarity search.

Embeddings are generated for:
- Transcript chunks (for "find similar moments")
- Scene summaries (for content clustering)
- Short descriptions (for style matching)

Vector dimension: 1536 (OpenAI text-embedding-3-small compatible,
also works with Groq embedding models)
"""
import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from pgvector.sqlalchemy import Vector

from .base import BaseModel

if TYPE_CHECKING:
    from .project import Project


EMBEDDING_DIM = 1536  # text-embedding-3-small / compatible models


class Embedding(BaseModel):
    __tablename__ = "embeddings"

    # Ownership
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # What this embedding represents
    source_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "transcript_chunk", "scene", "short"

    # UUID of the source record (transcript id, scene id, short id, etc.)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    # The text that was embedded (for debugging/display)
    text: Mapped[str] = mapped_column(Text, nullable=False)

    # The actual vector embedding
    embedding: Mapped[Optional[list]] = mapped_column(Vector(EMBEDDING_DIM), nullable=True)

    # Relationship
    project: Mapped["Project"] = relationship("Project", back_populates="embeddings")
