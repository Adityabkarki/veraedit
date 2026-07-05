"""Shared trigger-candidate shapes for Director signal modules."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class TriggerCandidate:
    id: str
    type: str
    transcript_start: float
    transcript_end: float
    confidence: float
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "transcriptStart": self.transcript_start,
            "transcriptEnd": self.transcript_end,
            "confidence": self.confidence,
            "metadata": self.metadata,
        }
