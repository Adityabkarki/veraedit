# Phase 11 — Director-Styled Shorts & Sizzle

Route every Short/Sizzle output through the Director pipeline so an extracted clip is a fully styled, platform-ready video — kinetic captions, beat-synced transitions, Social pillar grade — not a raw crop with a caption burned in.

Read the full spec at `../11-director-styled-shorts.md` before implementing.

## Phases

1. **Phase 0** — Extend `skills.md` with 3 new laws (Timeline Slicing Determinism, Re-Skin Consistency, Platform Variant)
2. **Phase 1** — Build `@lib/director/sliceTimeline.ts` for clip-boundary Timeline slicing
3. **Phase 2** — Handle fallback when no parent `DirectorTimeline` exists
4. **Phase 3** — Build `@lib/director/reskinTimeline.ts` for pillar re-skinning
5. **Phase 4** — Platform variants (per-platform CTA, caption density, end-card)
6. **Phase 5** — Vertical safe-zone compliance (9:16)
7. **Phase 6** — Wire into `POST /shorts` and `POST /sizzle/generate` endpoints

⏸️ Each phase has a checkpoint — stop and confirm before proceeding.
