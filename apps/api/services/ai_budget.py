"""
ViraEdit — AI spend tracker with hourly fallback + DB persistence (Phase 07).

In-memory rolling window drives local-model fallback; AISpendRecord rows power
the live per-project spend badge.
"""
from __future__ import annotations

import time
from collections import deque
from typing import Any

import structlog
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from config import settings

log = structlog.get_logger("viraedit.ai_budget")


class AIBudgetTracker:
    """Tracks hourly spend for fallback decisions and persists per-action rows."""

    def __init__(self) -> None:
        self._calls: deque[tuple[float, float]] = deque()
        self.total_usd: float = 0.0
        self.actions: list[dict[str, float | str]] = []

    def record(
        self,
        cost_usd: float,
        *,
        task: str | None = None,
        action: str | None = None,
        workspace_id: str | None = None,
        project_id: str | None = None,
        job_id: str | None = None,
        provider: str = "openai",
        model: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Record a spend event. Pass workspace_id/project_id for UI visibility."""
        resolved_action = action or task or "unknown"
        now = time.time()
        self._calls.append((now, cost_usd))
        while self._calls and self._calls[0][0] < now - 3600:
            self._calls.popleft()

        self.total_usd += cost_usd
        self.actions.append({"task": resolved_action, "cost_usd": cost_usd})
        log.info(
            "ai_budget_recorded",
            action=resolved_action,
            cost_usd=cost_usd,
            hourly_spend=self.hourly_spend,
            project_id=project_id,
        )

        if workspace_id or project_id:
            self._persist(
                cost_usd,
                workspace_id=workspace_id or project_id or "unknown",
                project_id=project_id,
                job_id=job_id,
                provider=provider,
                action=resolved_action,
                model=model,
                metadata=metadata,
            )

    def _persist(
        self,
        cost_usd: float,
        *,
        workspace_id: str,
        project_id: str | None,
        job_id: str | None,
        provider: str,
        action: str,
        model: str | None,
        metadata: dict[str, Any] | None,
    ) -> None:
        try:
            from models.ai_spend import AISpendRecord

            engine = create_engine(
                settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://"),
                pool_pre_ping=True,
            )
            SessionLocal = sessionmaker(bind=engine)
            with SessionLocal() as session:
                session.add(
                    AISpendRecord(
                        workspace_id=workspace_id,
                        project_id=project_id,
                        job_id=job_id,
                        provider=provider,
                        action=action,
                        model=model,
                        cost_usd=cost_usd,
                        metadata_json=metadata or {},
                    )
                )
                session.commit()
        except Exception as exc:
            log.warning("ai_spend_persist_failed", action=action, error=str(exc))

    @property
    def hourly_spend(self) -> float:
        return sum(cost for _, cost in self._calls)

    def should_use_local(self, limit_usd: float | None = None) -> bool:
        cap = limit_usd if limit_usd is not None else settings.AI_COST_LIMIT_USD_PER_HOUR
        ratio = self.hourly_spend / cap if cap > 0 else 0.0
        threshold = settings.AI_BUDGET_HARD_LIMIT_SWITCH_LOCAL
        return ratio >= threshold

    def reset(self) -> None:
        """Clear in-memory tracker state (tests only)."""
        self._calls.clear()
        self.total_usd = 0.0
        self.actions.clear()


budget = AIBudgetTracker()
