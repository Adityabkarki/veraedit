# Phase 15 — Long-Form Editor Performance Engine

Editor and preview responsiveness for long timelines. Depends on Phase 13 (Storage Efficiency) and Phase 12 (Analysis Scaling) — build those first. Makes scrubbing, editing, and reviewing a 90-minute project responsive in the browser.

Read the full spec at `../15-Editor-Performance.md` before implementing.

## Internal Phases

1. **Phase 0** — Extend `skills.md` with 2 new laws (Viewport Windowing, Diff-Based Undo)
2. **Phase 1** — Windowed Timeline data in the frontend (`timelineStore`)
3. **Phase 2** — Audit Remotion Composition mounting (use `<Sequence>` correctly)
4. **Phase 3** — Diff-based undo/redo for large projects
5. **Phase 4** — Pre-computed/cached waveform rendering per zoom level

⏸️ Each phase has a checkpoint — stop and confirm before proceeding.
