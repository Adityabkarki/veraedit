"""Request bodies for pipeline regeneration endpoints."""
from __future__ import annotations

from pydantic import BaseModel, Field


class RetranscribeRequest(BaseModel):
    """Regenerate or resume ElevenLabs transcription."""

    confirmation: str | None = Field(
        default=None,
        description='Type "Regenerate" when replacing an existing transcript.',
    )
    resume: bool = Field(
        default=True,
        description="If transcription was partial, continue from the last completed chunk.",
    )


class AnalyzeRequest(BaseModel):
    """Re-run chapter detection and/or shorts extraction."""

    confirmation: str | None = Field(
        default=None,
        description='Type "regenerate chapters" or "regenerate shorts" when output already exists.',
    )
    scope: str = Field(
        default="chapters",
        description='One of: "chapters" (story beats), "shorts", "all" (full analysis).',
    )


class RegenerateRequest(BaseModel):
    """Scoped regeneration with optional user prompt after reject."""

    scope: str = Field(
        description='One of: chapters, shorts, highlights, suggestions, master_edit',
    )
    user_prompt: str = Field(default="", max_length=2000)
    reject_ids: list[str] = Field(default_factory=list)
    confirmation: str | None = Field(
        default=None,
        description='Type "regenerate" when replacing existing scoped output.',
    )
