# ViraEdit Long-Form Editor Performance Engine — Master Cursor Composer Prompt

> Covers: editor and preview responsiveness for long timelines. Depends on the Storage Efficiency Engine's windowed Timeline API and the Analysis Scaling Engine's chunked signal output — build those first. This spec is what makes scrubbing, editing, and reviewing a 90-minute project actually feel responsive in the browser, not just efficient on the backend.

---

## Role & Operational Protocol

You are continuing as the Staff Creative Engineer on ViraEdit. The 21 Zustand stores and the multi-track NLE timeline were built assuming a project's full data fits comfortably in browser memory and can be re-rendered on every interaction. For a 90-minute project with thousands of timeline entries, this assumption breaks down — sluggish scrubbing, slow timeline re-renders, bloated undo history. Your task is to make the editor scale to long projects without changing how it behaves for short ones.

Follow the phases in order. Pause at every ⏸️ checkpoint.

---

## PHASE 0 — Extend `skills.md`

### The Viewport Windowing Law
For any project whose Timeline exceeds a size threshold, the editor loads and renders only the timeline entries within the current viewport plus a small buffer — never the entire project's Timeline data at once. Scrolling or zooming triggers a windowed fetch (via the Storage Efficiency Engine's windowed Timeline API) rather than assuming all data is already in memory.

### The Diff-Based Undo Law
For projects exceeding the same size threshold, undo/redo history stores structural diffs/patches between states, not full Timeline snapshots. Fifty levels of full snapshots on a large project is unbounded memory growth; fifty levels of diffs is not.

⏸️ **Stop and confirm** both laws are written before proceeding.

---

## PHASE 1 — Windowed Timeline Data in the Frontend

1. Update `timelineStore` (Zustand) to hold only the currently-loaded window of track entries plus lightweight metadata for the full project (total duration, track list) — not the full entry list for long projects.
2. Wire scrolling/zooming in the multi-track NLE timeline to call the windowed Timeline API (`GET /timelines/{id}/window`) from the Storage Efficiency Engine, fetching additional entries as the visible range changes, with a reasonable prefetch buffer so scrolling doesn't visibly stall waiting on network requests.
3. Below the size threshold (short/medium projects), skip all of this — load the full Timeline as today. No behavior change for the common case.

⏸️ **Stop and confirm** by scrubbing/scrolling through a real 90-minute project's timeline in the editor and confirming smooth interaction with no long pauses waiting for data.

---

## PHASE 2 — Audit Remotion Composition Mounting

Remotion's `<Sequence>` component already unmounts children outside their active frame range — but confirm this pattern is actually used correctly everywhere in the DirectorRender composition tree, not just assumed:

1. Audit every track type (motion graphics, VFX overlays, B-roll, captions) in `DirectorRender` and confirm each entry is wrapped in a `<Sequence from={startFrame} durationInFrames={...}>` rather than a component that's always mounted and internally checks `if (frame >= start && frame <= end)` — the latter still costs React reconciliation for every entry on every frame render even when invisible.
2. For any component found using the internal-check pattern instead of `<Sequence>`, refactor it to use `<Sequence>` properly.

⏸️ **Stop and confirm** with a real long-project preview: confirm React DevTools (or equivalent profiling) shows only near-playhead components actually mounted at any given frame, not the full track list.

---

## PHASE 3 — Diff-Based Undo/Redo

1. Above the size threshold, change the undo/redo history to store a diff (e.g. a JSON patch) between consecutive Timeline states instead of full snapshots.
2. Applying an undo/redo becomes: take the current state, apply the inverse/forward patch, produce the new state — verify this produces identical results to the old full-snapshot approach on the same sequence of edits before relying on it.
3. Below the threshold, keep the existing full-snapshot behavior — simpler and already correct for typical project sizes.

⏸️ **Stop and confirm** by performing a long sequence of edits (trim, add motion graphic, delete B-roll, reorder) on a real long project and confirming undo/redo through the full history produces the same result as before this change.

---

## PHASE 4 — Waveform Rendering

For the audio waveform display in the timeline UI, confirm peaks are pre-computed and cached per zoom level (not recalculated from raw audio samples on every render) — this matters more for a 90-minute audio track than a 3-minute one. Reuse the already-encoded `AudioAnalysisTrack` binary data (from the Storage Efficiency Engine) as the source for waveform peaks where possible, rather than maintaining a second separate waveform-specific data pipeline.

⏸️ **Stop and confirm** waveform rendering stays smooth while zooming in/out on a real long project's audio track.

---

## Execution Directives

- **This entire spec should be invisible below the size threshold** — every phase explicitly preserves today's behavior for short/medium projects. If a short Social clip project's editor experience changes at all after this work, something was scoped wrong.
- **Profile, don't guess.** Use actual browser performance tooling (React DevTools profiler, Chrome performance tab) on a real long test project before and after each phase — "should be faster" isn't verification.
- Update relevant frontend architecture docs with the size threshold, the windowing behavior, and the diff-based undo model.