# ViraEdit Long-Form Storage Efficiency Engine — Master Cursor Composer Prompt

> Covers: compact binary storage for high-cardinality per-frame data, and windowed access to large Timelines. A 90-minute video at 30fps is 162,000 frames — an `AudioAnalysisTrack` with one entry per frame, or a `DirectorTimeline` with thousands of trigger/track entries, becomes a genuinely large JSON payload if stored and loaded naively. This spec fixes storage format and access patterns before they become a real bottleneck.

---

## Role & Operational Protocol

You are continuing as the Staff Creative Engineer on ViraEdit. `AudioAnalysisTrack` and `DirectorTimeline` are both currently modeled as JSON/JSONB structures with one entry per frame or per trigger. This works fine at short-form scale and gets expensive at long-form scale — large payloads to load/save on every edit, slow queries, bloated Postgres rows. This spec introduces compact binary storage for per-frame data and windowed access for large timelines, without changing what either structure means to the systems that consume them.

Follow the phases in order. Pause at every ⏸️ checkpoint.

---

## PHASE 0 — Extend `skills.md`

### The Binary Payload Law
Any per-frame or otherwise high-cardinality analysis data (audio amplitude/band arrays, and any future frame-indexed dataset) is stored as a compact, quantized binary blob in object storage (MinIO), referenced by a lightweight database row containing metadata only (content hash, frame count, band count, format version). It is never stored as a raw JSON array of per-frame objects in a Postgres JSONB column.

### The Windowed Timeline Access Law
Any client (editor UI, Trigger Log viewer) reading a `DirectorTimeline` for a long project must be able to fetch a time-windowed slice of its tracks (e.g. "entries between frame X and Y") rather than always loading the entire Timeline JSON. The full JSONB blob remains the single source of truth for compile/render (per the existing Single Source of Truth Timeline Law) — this law governs *read* access patterns for UI purposes, not the canonical storage format itself.

⏸️ **Stop and confirm** both laws are written before proceeding.

---

## PHASE 1 — Binary Format for Audio Analysis

Define the binary layout for `AudioAnalysisTrack`, replacing the naive per-frame JSON array:

```
Header (fixed size):
  - schemaVersion: uint16
  - fps: uint16
  - frameCount: uint32
  - bandCount: uint8
  - peakAmplitude: float32

Body (per frame, packed sequentially):
  - overallAmplitude: uint8   (quantized 0-255, representing 0.0-1.0 scaled by peakAmplitude)
  - bands: uint8[bandCount]   (quantized 0-255 each)
  - isTransient: 1 bit, packed 8-per-byte in a trailing bitmask section
```

1. Build `@lib/audio/encodeAnalysisTrack.ts` / `decodeAnalysisTrack.ts` implementing this packing/unpacking.
2. Gzip the packed binary before upload to MinIO (per-frame quantized data compresses well due to the smooth, correlated nature of amplitude data).
3. The database row (`audio_analysis` table or equivalent) stores only: `sourceHash`, `storageKey` (MinIO path), `schemaVersion`, `fps`, `frameCount`, `bandCount`, `peakAmplitude`, `meta`. No per-frame data in Postgres.
4. Update `visualizeAudio`/consumption code (from the Audio-Reactive Amplitude spec) to decode this binary format on load rather than reading a JSON array — the resulting `AudioAnalysisFrame` shape returned to components is unchanged, only the storage/loading mechanism changes.

⏸️ **Stop and confirm** by comparing payload size before/after for a real 75-minute test podcast's audio analysis — this should be a dramatic reduction (a full JSON array of per-frame floats vs. a gzip'd quantized binary is typically an order of magnitude smaller) — and confirm decoded values still drive the equalizer visually correctly.

---

## PHASE 2 — Migration

Write a one-time migration script that finds any existing `AudioAnalysisTrack` rows stored in the old naive JSON format, re-encodes them via `encodeAnalysisTrack()`, uploads the binary to MinIO, and updates the DB row to the new pointer-based schema. Run this against a staging copy of real data first, not production directly.

⏸️ **Stop and confirm** the migration script runs cleanly against a staging snapshot and spot-check a few migrated tracks decode identically to their pre-migration values before running against production data.

---

## PHASE 3 — Windowed Timeline Query API

1. Add `GET /api/v1/timelines/{id}/window?startFrame=X&endFrame=Y` returning only the `DirectorTimeline` track entries whose frame range intersects `[startFrame, endFrame]`, plus the top-level metadata (`theme`, `contentType`, `fps`, `durationInFrames`) always included regardless of window.
2. Implementation choice: either (a) extract the range directly from the canonical JSONB using a Postgres JSONB query/filter, or (b) maintain a denormalized `timeline_entries` table (one row per track entry, indexed on `startFrame`/`endFrame`) kept in sync with the canonical JSONB on every write, queried for fast range lookups. Prefer (b) if range queries need to be frequent/fast (e.g. on every timeline scroll), since JSONB filtering doesn't use an index as efficiently as a dedicated indexed table.
3. **If using (b):** add a law-level constraint — the denormalized table is regenerated from the canonical JSONB on every write, never edited independently, so the two representations cannot drift. The JSONB blob remains the only thing `resolveTimeline()`/render ever reads.

⏸️ **Stop and confirm** the windowed endpoint returns correct, complete results for a few test ranges on a real long-project Timeline, and that a full-timeline request still works unchanged for short projects.

---

## PHASE 4 — Trigger Log Pagination

The `TriggerLogEntry` list can run into the thousands for a 90-minute file (every trigger considered, realized or suppressed). Add pagination (`?cursor=`/`?page=`) to whatever endpoint serves the Trigger Log UI, and confirm the frontend's Trigger Log viewer (from the Production Integration spec's Phase 3) loads incrementally rather than requesting the entire list at once for long projects.

⏸️ **Stop and confirm** the Trigger Log UI remains responsive when opened on a real long-project Timeline with thousands of logged triggers.

---

## Execution Directives

- **Verify no behavior change for short projects** — the binary format and windowed queries should be transparent; a 5-minute Social clip's audio analysis and timeline access should work exactly as before, just via the new efficient path.
- **Measure, don't assume.** Report actual before/after payload sizes and query times on a real long test file — "should be smaller" isn't a substitute for confirming it actually is.
- Update `director-engine.md` and `motion-graphics.md` with the binary format spec and the windowed query API contract.