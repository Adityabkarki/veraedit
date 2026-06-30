"""
ViraEdit — In-memory AI spend tracker (Phase 00 foundation).

Records per-action costs from vision tagging and other lightweight AI calls.
Phase 07 expands this into full per-project metering.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import structlog

from config import settings

log = structlog.get_logger("viraedit.ai_budget")


@dataclass
class AIBudgetTracker:
    """Tracks cumulative AI spend for the current process."""

    total_usd: float = 0.0
    actions: list[dict[str, float | str]] = field(default_factory=list)

    def record(self, cost_usd: float, *, task: str = "unknown") -> None:
        """Record a single AI API call cost."""
        self.total_usd += cost_usd
        self.actions.append({"task": task, "cost_usd": cost_usd})
        log.info("ai_budget_recorded", task=task, cost_usd=cost_usd, total_usd=self.total_usd)

    def should_use_local(self, limit_usd: float | None = None) -> bool:
        """True when in-process spend exceeds the hourly budget cap."""
        cap = limit_usd if limit_usd is not None else settings.AI_COST_LIMIT_USD_PER_HOUR
        return self.total_usd >= cap

    def reset(self) -> None:
        """Clear tracker state (used in tests)."""
        self.total_usd = 0.0
        self.actions.clear()


budget = AIBudgetTracker()
