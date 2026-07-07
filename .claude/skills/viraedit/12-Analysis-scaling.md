# ViraEdit Long-Form AI Analysis Scaling Engine — Master Cursor Composer Prompt

> Covers: chunked/parallelized signal extraction for long videos (diarization, topic segmentation, stat/emphasis extraction). Every Director Engine signal module currently assumes it can process a whole transcript/audio file in one pass — fine for a 5-minute clip, expensive/slow/context-limited for a 90-minute podcast. This spec adds chunking with correct boundary handling.

---

## Role & Operational Protocol

You are continuing as the Staff Creative Engineer on ViraEdit. The signal-extraction modules (diarization, topic segmentation, stat extraction, emphasis scoring, scene classification) were built assuming single-pass processing. For long-form content this either exceeds practical LLM context/cost limits (topic segmentation over a 90-minute transcript) or risks losing consistency across the file (diarization speaker identity). Your task is to add a chunking layer with correct overlap/reconciliation handling, without changing the shape of what each module outputs downstream.

Follow the phases in order. Pause at every ⏸️ checkpoint.

---

## PHASE 0 — Extend `skills.md`

### The Chunk Overlap & Boundary Reconciliation Law
Any module processing long content in chunks must use overlapping chunk windows (not adjacent, non-overlapping ones). A reconciliation pass must run after chunk-level processing to deduplicate detections that fall in the overlap region and merge/align boundaries (e.g. a topic segment split across a chunk edge) into one coherent result. A trigger or segment must never be double-counted or silently dropped at a chunk boundary.

### The Speaker Identity Continuity Law
When diarization runs in chunks, each chunk's local speaker IDs (e.g. "Speaker A," "Speaker B" within that chunk) must be reconciled to **global**, file-consistent speaker IDs via embedding similarity matching across chunk boundaries — not assumed to align by label alone. "Speaker A" in chunk 3 is not guaranteed to be the same person as "Speaker A" in chunk 1 without this reconciliation step.

### The Chunked Cost Accounting Law
When AI analysis is split across parallel chunk-processing tasks, every chunk's cost must be attributed atomically to the same project's `ai_spend_records` ledger. Parallel writes must not race or lose cost data — the existing $2/hour budget enforcement must see the true aggregate cost of a chunked job, not an undercount from a race condition.

⏸️ **Stop and confirm** all three laws are written before proceeding.

---

## PHASE 1 — Chunk Planning

Build `@lib/analysis/planChunks.ts`:

```typescript
export interface ChunkPlan {
  chunkIndex: number;
  coreStart: number;   // seconds — the non-overlapping "owned" region of this chunk
  coreEnd: number;
  windowStart: number; // seconds — coreStart minus overlap, clamped to 0
  windowEnd: number;   // seconds — coreEnd plus overlap, clamped to file duration
}

export function planChunks(durationSeconds: number, options?: { chunkTargetMinutes?: number; overlapSeconds?: number }): ChunkPlan[] {
  // Only chunk if durationSeconds exceeds a threshold (e.g. 15 minutes).
  // Below threshold: return a single ChunkPlan covering the whole file — no behavior change for short/medium content.
  // Above threshold: target ~8-10 minute core windows with ~20-30 second overlap on each side.
}
```

**Rule:** this must produce a single-chunk plan (a no-op) for anything under the threshold, so short-form content (the majority of Social/Shorts use cases) sees zero change in behavior or latency.

⏸️ **Stop and confirm** chunk planning produces sane windows for a real 75-minute test podcast before proceeding.

---

## PHASE 2 — Parallel Dispatch

Wire each signal-extraction module to run per-chunk via a Celery `group`, with a `chord` callback for reconciliation:

1. **Diarization** — run pyannote (or the embedding-extraction step) per chunk window. Each chunk emits local speaker segments + embeddings.
2. **Topic segmentation** — run the LLM-based semantic clustering per chunk's transcript slice, producing local topic boundaries + summaries. This is the module most affected by context/cost limits on long files — chunking is what makes it tractable at all past a certain length.
3. **Stat/number extraction, feature-mention detection, emphasis scoring** — these are local, sentence-level operations with no real cross-chunk dependency other than avoiding double-detection in overlap regions; parallelize trivially per chunk.
4. **Scene classification** — parallelize per chunk on the video track the same way.

Each chunk task writes its raw (unreconciled) output keyed by `chunkIndex`; the chord callback (Phase 3) doesn't run until all chunks for that module complete.

⏸️ **Stop and confirm** all chunk tasks for one module (start with stat extraction — simplest) complete and produce per-chunk output before proceeding.

---

## PHASE 3 — Reconciliation

Build `@lib/analysis/reconcile{Diarization,Topics,Triggers}.ts` — one reconciler per module type, since the merge logic differs:

1. **Diarization reconciliation** — compute embedding centroids per local speaker per chunk, then greedily match speakers across adjacent chunks by cosine similarity above a threshold, assigning stable global speaker IDs. Flag low-confidence matches (ambiguous cross-chunk identity) rather than silently guessing.
2. **Topic reconciliation** — for chunks with overlapping windows, compare topic boundaries falling in the overlap region; if two chunks propose different boundaries for what's evidently the same topic shift, keep the one with higher model confidence and drop the other. Merge adjacent chunks' chapter lists into one continuous sequence.
3. **Trigger reconciliation** (stat mentions, emphasis, feature callouts) — any trigger whose timestamp falls in an overlap region and was detected by both neighboring chunks is deduplicated (keep one, by highest confidence). Triggers outside any overlap region pass through untouched.

⏸️ **Stop and confirm** reconciled output for a real 75-minute test podcast shows no duplicate triggers at chunk boundaries and consistent speaker IDs across the full file, spot-checked manually against several boundary crossings.

---

## PHASE 4 — Cost Accounting

Wrap each chunk's LLM/AI calls so their cost writes to `ai_spend_records` using an atomic increment (DB-level `UPDATE ... SET cost = cost + $1` or equivalent), not a read-modify-write from application code that could race across parallel Celery workers. Confirm the existing $2/hour hard limit and $1.60/hour warning threshold correctly see the aggregate cost of a chunked job in real time, not just after all chunks complete.

⏸️ **Stop and confirm** by running a chunked topic-segmentation job on a long test file and verifying the budget dashboard reflects cost incrementally as chunks complete, not in one lump sum at the end (or worse, undercounted).

---

## PHASE 5 — Integrate into Director Signal Extraction

Update the Director Engine's existing signal-extraction phase to call `planChunks()` first, then dispatch through this chunked pipeline when the plan returns more than one chunk. No changes needed to the Director rule sets themselves (Podcast/Consultancy/Social/Showcase) — they consume the same reconciled signal shapes as before, just now correct and performant at length.

⏸️ **Stop and confirm** end-to-end: run full Director signal extraction on a real 75–90 minute podcast test file and confirm total processing time and cost are reasonable (define "reasonable" concretely before running — e.g. under 10 minutes wall-clock, under $1.50 total AI cost) before considering this complete.

---

## Execution Directives

- **Verify the single-chunk no-op path first** — before testing long-file chunking, confirm a short test video still produces identical signal-extraction output through this new code path as it did before. Regressing short-form accuracy while fixing long-form performance would be a bad trade.
- **Speaker identity continuity is the highest-risk reconciliation** — a wrong cross-chunk speaker match silently corrupts every downstream Podcast pillar decision (Active Speaker Split-Cards, multicam switching). Spot-check this more carefully than the others.
- Update `director-engine.md` with the chunking thresholds, overlap window sizes, and reconciliation logic per module.