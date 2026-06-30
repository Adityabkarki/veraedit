# Phase 7 — AI Spend Meter (Live, Per-Action, Per-Project Visibility)

## Why this matters specifically for this product

This app makes many AI calls per video: Gemini video analysis, Gemini image
generation, GPT-4o-mini transcript reasoning (chapters, virality, sizzle scoring),
ElevenLabs transcription. A non-editor user has no intuition for what any of this
costs. Surfacing spend continuously — not just as a surprise invoice — is both an
ethical requirement and a trust-building feature. It also gives power users a lever
to understand why a render took the credits it did.

The existing `ai_budget.py` tracker (from the original skill set) already records
spend in-memory per hour for the local/Ollama fallback decision. This phase extends
it to (a) persist spend per-action and per-project in the database, not just an
in-memory hourly rolling window, and (b) expose it live to the frontend via a
lightweight polling badge visible on every screen.

---

## Database Model

### `backend/app/models/ai_spend.py`

```python
from sqlalchemy import Column, String, Float, DateTime, JSON
from sqlalchemy.sql import func
from ..database import Base
import uuid

class AISpendRecord(Base):
    """
    One row per individual AI call. Cheap to write, queryable for live totals
    per project/workspace, and gives a full audit trail of where spend went.
    """
    __tablename__ = "ai_spend_records"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String, nullable=False, index=True)
    project_id = Column(String, nullable=True, index=True)
    job_id = Column(String, nullable=True)
    provider = Column(String, nullable=False)     # "openai" | "gemini" | "elevenlabs"
    action = Column(String, nullable=False)        # "transcribe" | "style_analyze" | "image_gen" | etc.
    model = Column(String, nullable=True)           # "gpt-4o-mini" | "gemini-2.0-flash" | "scribe_v2"
    cost_usd = Column(Float, nullable=False)
    metadata_json = Column(JSON, default=dict)      # extra context: duration, token count, etc.
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

---

## Extended Budget Tracker (writes to DB, not just in-memory)

### `backend/app/services/ai_budget.py` (replaces the original)

```python
import time
from collections import deque
from ..config import settings

class AIBudgetTracker:
    """
    In-memory rolling window for the hourly local-fallback decision (unchanged
    behavior from the original implementation), PLUS persistent per-action
    recording to AISpendRecord for live UI display and historical reporting.
    """
    def __init__(self):
        self._calls: deque = deque()  # (timestamp, cost_usd) — for hourly fallback logic

    def record(self, cost_usd: float, *, workspace_id: str = None, project_id: str = None,
               job_id: str = None, provider: str = "openai", action: str = "unknown",
               model: str = None, metadata: dict = None):
        """
        Records a spend event. workspace_id should be passed whenever available —
        calls without it (legacy call sites) still work for the hourly budget
        check but won't appear in the per-project spend UI until updated.
        """
        now = time.time()
        self._calls.append((now, cost_usd))
        while self._calls and self._calls[0][0] < now - 3600:
            self._calls.popleft()

        if workspace_id:
            self._persist(cost_usd, workspace_id, project_id, job_id, provider, action, model, metadata)

    def _persist(self, cost_usd, workspace_id, project_id, job_id, provider, action, model, metadata):
        # Sync write — these are tiny, frequent inserts; use the sync session
        # pattern already established for Celery tasks (see models/job.py)
        from ..models.ai_spend import AISpendRecord
        from ..models.job import _SyncSession
        with _SyncSession() as session:
            record = AISpendRecord(
                workspace_id=workspace_id, project_id=project_id, job_id=job_id,
                provider=provider, action=action, model=model,
                cost_usd=cost_usd, metadata_json=metadata or {},
            )
            session.add(record)
            session.commit()

    @property
    def hourly_spend(self) -> float:
        return sum(c for _, c in self._calls)

    def should_use_local(self) -> bool:
        ratio = self.hourly_spend / settings.ai_budget_per_hour_usd
        return ratio >= settings.ai_budget_hard_limit_switch_local

    def get_model(self) -> str:
        if self.should_use_local():
            return f"ollama:{settings.ollama_base_url}"
        return settings.openai_model_primary

budget = AIBudgetTracker()
```

---

## Updating Every Existing AI Call Site

Every place that currently calls `budget.record(cost)` across all prior phases/modules
needs to be updated to pass the new context kwargs. This is a mechanical but important
pass — without it, spend won't show up per-project.

```python
# BEFORE (original pattern used throughout earlier modules):
budget.record(0.00015)

# AFTER (Phase 7 pattern — pass context wherever the call site has it available):
budget.record(
    0.00015,
    workspace_id=workspace_id,
    project_id=project_id,
    job_id=job_id,
    provider="openai",
    action="asset_tagging",
    model=settings.openai_model_primary,
)
```

### Cost Reference Table (use these constants, don't hardcode magic numbers inline)

```python
# backend/app/services/ai_costs.py
"""Centralized cost-per-call constants. Update when provider pricing changes."""

COSTS = {
    "openai_gpt4o_mini_vision_call": 0.00015,
    "openai_gpt4o_mini_text_call_per_1k_tokens": 0.00015,
    "openai_dalle3_standard": 0.04,
    "openai_dalle3_hd": 0.08,
    "gemini_video_analysis_flat": 0.05,
    "gemini_image_generation": 0.04,
    "elevenlabs_scribe_per_minute": 0.0067,  # ~$0.40/hr ÷ 60
}

def estimate_elevenlabs_cost(audio_duration_seconds: float) -> float:
    return (audio_duration_seconds / 60) * COSTS["elevenlabs_scribe_per_minute"]

def estimate_text_call_cost(prompt_text: str) -> float:
    estimated_tokens = len(prompt_text) / 4
    return (estimated_tokens / 1000) * COSTS["openai_gpt4o_mini_text_call_per_1k_tokens"]
```

---

## API Endpoints for Live Spend Display

### `backend/app/routers/ai_spend.py`

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from ..database import get_db
from ..models.ai_spend import AISpendRecord

router = APIRouter(prefix="/api/ai-spend", tags=["ai-spend"])

@router.get("/project/{project_id}")
async def get_project_spend(project_id: str, db: AsyncSession = Depends(get_db)):
    """Live running total + breakdown for a single project — polled by the UI badge."""
    result = await db.execute(
        select(AISpendRecord).where(AISpendRecord.project_id == project_id)
    )
    records = result.scalars().all()
    total = sum(r.cost_usd for r in records)

    by_action: dict = {}
    for r in records:
        by_action.setdefault(r.action, 0.0)
        by_action[r.action] += r.cost_usd

    return {
        "total_usd": round(total, 4),
        "by_action": {k: round(v, 4) for k, v in by_action.items()},
        "call_count": len(records),
    }

@router.get("/workspace/{workspace_id}")
async def get_workspace_spend(workspace_id: str, period_days: int = 30,
                              db: AsyncSession = Depends(get_db)):
    """Aggregate spend for a workspace over a period — for a billing/usage dashboard."""
    from datetime import datetime, timedelta
    cutoff = datetime.utcnow() - timedelta(days=period_days)
    result = await db.execute(
        select(AISpendRecord).where(
            AISpendRecord.workspace_id == workspace_id,
            AISpendRecord.created_at >= cutoff,
        )
    )
    records = result.scalars().all()
    total = sum(r.cost_usd for r in records)

    by_provider: dict = {}
    for r in records:
        by_provider.setdefault(r.provider, 0.0)
        by_provider[r.provider] += r.cost_usd

    return {
        "total_usd": round(total, 4),
        "by_provider": {k: round(v, 4) for k, v in by_provider.items()},
        "period_days": period_days,
    }
```

---

## Frontend: The Live Badge (visible on every screen)

### `frontend/components/shared/AISpendBadge.tsx`

```tsx
"use client";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL;

export function AISpendBadge({ projectId }: { projectId: string }) {
  const [spend, setSpend] = useState<{ total_usd: number; call_count: number } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [breakdown, setBreakdown] = useState<Record<string, number>>({});

  useEffect(() => {
    const poll = async () => {
      const res = await fetch(`${API}/api/ai-spend/project/${projectId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      setSpend(data);
      setBreakdown(data.by_action);
    };
    poll();
    const interval = setInterval(poll, 4000); // refresh every 4s during active editing
    return () => clearInterval(interval);
  }, [projectId]);

  if (!spend) return null;

  const ACTION_LABELS: Record<string, string> = {
    asset_tagging: "Tagging your assets",
    style_analyze: "Analyzing reference video",
    image_gen: "Generating images",
    transcribe: "Transcribing audio",
    chapter_detect: "Finding chapters",
    sizzle_detect: "Finding highlights",
    virality_score: "Scoring clips",
  };

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        <span className="font-medium">${spend.total_usd.toFixed(3)}</span>
        <span className="text-gray-400">AI spend</span>
      </button>

      {expanded && (
        <div className="absolute top-full right-0 mt-2 bg-white border rounded-xl shadow-lg w-64 p-3 z-50">
          <p className="text-xs font-medium text-gray-700 mb-2">This project's AI spend</p>
          <div className="space-y-1.5 mb-2">
            {Object.entries(breakdown).map(([action, cost]) => (
              <div key={action} className="flex justify-between text-xs">
                <span className="text-gray-500">{ACTION_LABELS[action] || action}</span>
                <span className="font-medium">${cost.toFixed(4)}</span>
              </div>
            ))}
          </div>
          <div className="border-t pt-2 flex justify-between text-xs font-semibold">
            <span>Total</span>
            <span>${spend.total_usd.toFixed(4)}</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">{spend.call_count} AI calls so far</p>
        </div>
      )}
    </div>
  );
}
```

### Workspace-Level Usage Dashboard — `frontend/app/workspaces/[id]/usage/page.tsx`

```tsx
"use client";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL;

export default function UsagePage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch(`${API}/api/ai-spend/workspace/${params.id}?period_days=30`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    }).then(r => r.json()).then(setData);
  }, [params.id]);

  if (!data) return null;

  return (
    <div className="max-w-xl mx-auto py-12">
      <h1 className="text-xl font-semibold mb-1">AI usage — last 30 days</h1>
      <p className="text-3xl font-bold mb-6">${data.total_usd.toFixed(2)}</p>

      <div className="space-y-2">
        {Object.entries(data.by_provider).map(([provider, cost]: [string, any]) => (
          <div key={provider} className="flex justify-between border-b py-2 text-sm">
            <span className="capitalize">{provider}</span>
            <span className="font-medium">${cost.toFixed(3)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Checklist for Cursor

- [ ] `backend/app/models/ai_spend.py` — `AISpendRecord` model + Alembic migration
- [ ] `backend/app/services/ai_budget.py` — extended `record()` accepting context kwargs,
      backwards compatible with bare `budget.record(cost)` calls from earlier phases
- [ ] `backend/app/services/ai_costs.py` — centralized cost constants, no more magic
      numbers scattered across processor files
- [ ] **Audit pass**: go through every `budget.record(...)` call site in Phases 0-6
      and add `workspace_id`, `project_id`, `job_id`, `action` context — this is
      mechanical but必须 be done everywhere or spend tracking has gaps
- [ ] `backend/app/routers/ai_spend.py` — project + workspace spend endpoints
- [ ] `AISpendBadge.tsx` — polls every 4s, shown in the header of every project screen
      (already wired into Phase 6's `clone-style/page.tsx` example)
- [ ] Workspace usage dashboard page
- [ ] `AISpendBadge` added to Phase 3 (Shorts), Phase 4 (Chapters), Phase 5 (Sizzle)
      screens too — spend visibility must be consistent everywhere, not just the
      clone-style flow
- [ ] Confirm actual ElevenLabs/OpenAI/Gemini pricing against current docs before
      finalizing `ai_costs.py` constants — these are estimates and will drift
