# Phase 16 — Production Completeness Engine

Closes coverage gaps, guarantees every trigger type has a visual outcome, validates style cloning threads through all layers, improves B-roll match quality, and adds a pre-export readiness gate so incompleteness is caught before the user sees an unfinished export.

Read the full spec at `../16-production-completeness.md` before implementing.

## Internal Phases

1. **Phase 0** — Extend `skills.md` with 3 new laws (Fallback Guarantee, Style Depth, Pre-Export Completeness Gate)
2. **Phase 1** — Build `@lib/director/auditCoverage.ts` — enumerate every trigger type, map to component status, produce gap report
3. **Phase 2** — Build priority missing components (Topic Title Card, Icon Callout, Bullet Reveal, Comparison Table, Pull-Quote Card)
4. **Phase 3** — Fallback guarantee implementation — fallback chain per trigger type
5. **Phase 4** — Style depth audit & fix — grade, motion, B-roll mood keywords
6. **Phase 5** — B-roll match quality & threshold validation against real data
7. **Phase 6** — Pre-export readiness gate with auto-resolution + user checklist
8. **Phase 7** — Full real-video validation (Podcast + Consultancy, zero manual intervention)

⏸️ Each phase has a checkpoint — stop and confirm before proceeding.
