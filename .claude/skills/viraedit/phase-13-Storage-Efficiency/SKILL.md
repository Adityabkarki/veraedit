# Phase 13 — Long-Form Storage Efficiency Engine

Compact binary storage for high-cardinality per-frame data and windowed access to large Timelines. Fixes storage format and access patterns before they become a bottleneck for 90-minute projects.

Read the full spec at `../13-Storage-Efficiency.md` before implementing.

## Internal Phases

1. **Phase 0** — Extend `skills.md` with 2 new laws (Binary Payload, Windowed Timeline Access)
2. **Phase 1** — Binary format for `AudioAnalysisTrack` with quantized per-frame packing + gzip
3. **Phase 2** — Migration script from old JSON format to new binary format
4. **Phase 3** — Windowed Timeline query API (`GET /timelines/{id}/window`)
5. **Phase 4** — Trigger Log pagination for the UI

⏸️ Each phase has a checkpoint — stop and confirm before proceeding.
