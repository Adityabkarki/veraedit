# Phase 12 — Long-Form AI Analysis Scaling Engine

Chunked/parallelized signal extraction for long videos (diarization, topic segmentation, stat/emphasis extraction). Adds chunking with correct boundary handling so the Director Engine scales to 90-minute podcasts.

Read the full spec at `../12-Analysis-scaling.md` before implementing.

## Internal Phases

1. **Phase 0** — Extend `skills.md` with 3 new laws (Chunk Overlap & Boundary Reconciliation, Speaker Identity Continuity, Chunked Cost Accounting)
2. **Phase 1** — Build `@lib/analysis/planChunks.ts` for chunk planning with overlap windows
3. **Phase 2** — Parallel dispatch per chunk via Celery `group` with `chord` callback
4. **Phase 3** — Reconciliation per module (diarization, topics, triggers)
5. **Phase 4** — Cost accounting with atomic increment (no race conditions on parallel writes)
6. **Phase 5** — Integrate into Director Engine signal extraction

⏸️ Each phase has a checkpoint — stop and confirm before proceeding.
