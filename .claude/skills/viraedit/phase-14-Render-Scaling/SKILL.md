# Phase 14 — Long-Form Render Scaling Engine

Chunked parallel rendering, lossless stitching, resumable render jobs, and pre-export time/cost estimation. Splits long renders into parallel, resumable segments so a 90-minute export is robust to failure.

Read the full spec at `../14-Render-Scaling.md` before implementing.

## Internal Phases

1. **Phase 0** — Extend `skills.md` with 2 new laws (Segment Boundary Alignment, Render Resumability)
2. **Phase 1** — Build `@lib/render/planRenderSegments.ts` for segment planning
3. **Phase 2** — Parallel render dispatch & resumable per-segment status
4. **Phase 3** — Lossless FFmpeg concat stitching with audio continuity verification
5. **Phase 4** — Pre-export time & cost estimate

⏸️ Each phase has a checkpoint — stop and confirm before proceeding.
