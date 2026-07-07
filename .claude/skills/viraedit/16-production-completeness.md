# ViraEdit Production Completeness Engine — Master Cursor Composer Prompt

> The Director Engine, Motion Graphics Library, Style system, and AI B-Roll all individually work — but a real full-length podcast or consultancy upload still comes out needing manual finishing. This is a coverage and fallback problem, not an architecture problem: triggers fire correctly, but there's often no component built to satisfy them, no B-roll clears the confidence threshold, or the cloned style only reaches part of the render stack. This spec closes those gaps and adds a pre-export readiness check so incompleteness is caught and fixed automatically — or surfaced clearly — before the user ever sees an unfinished export.

---

## Role & Operational Protocol

You are continuing as the Staff Creative Engineer on ViraEdit. Individually working subsystems are producing an incomplete whole on real long-form content. Your task: audit exactly where coverage is thin, guarantee every trigger type has *some* on-brand visual outcome even when the ideal one isn't available, confirm style cloning actually threads through every layer it should, improve B-roll match quality with a defined fallback tier, and add a readiness gate that catches remaining gaps before export instead of after.

Follow the phases in order. Pause at every ⏸️ checkpoint.

---

## PHASE 0 — Extend `skills.md`

### The Fallback Guarantee Law
Every Director trigger type that gets **realized** (survives Density Throttle) must produce a rendered visual outcome — never nothing. If the ideal component for that trigger type doesn't exist yet, or the ideal B-roll match doesn't clear the confidence threshold, a defined fallback (Phase 3/5) renders instead. A realized trigger producing no visible output is treated as a bug, not an acceptable gap.

### The Style Depth Law
A cloned or applied style (`ThemeToken` + `GradeToken`) must influence every layer capable of being themed: colors, fonts, grade, motion personality (`defaultCurve`), and B-roll search bias (visual mood keywords appended to search queries). A style application that only changes colors and fonts is incomplete and must be flagged, not shipped as "style applied."

### The Pre-Export Completeness Gate Law
Before a project is offered for export, a completeness pass runs across the compiled `DirectorTimeline` checking for: segments exceeding a maximum duration with no visual variety, any B-roll entry below the match-confidence threshold, and any high-confidence suppressed trigger that has no fallback rendered nearby. Results are either auto-resolved or surfaced to the user as a short, actionable checklist — never silently ignored.

⏸️ **Stop and confirm** all three laws are written before proceeding.

---

## PHASE 1 — Coverage Audit

Build `@lib/director/auditCoverage.ts` and run it once, manually reviewed, before writing any new components:

1. Enumerate every trigger type defined across all four Director rule sets (Podcast/Consultancy/Social/Showcase).
2. For each trigger type, confirm whether a real, implemented atomic component exists to satisfy it (not just referenced in a schema — actually built and rendering).
3. Produce a gap report: trigger type → component status (`built` / `missing` / `partial`).

**Expect real gaps**, especially for Consultancy (bullet/list reveals, comparison tables) and Podcast (a "no good B-roll available" fallback state), since those weren't fully covered in the original pillar builds.

⏸️ **Stop and confirm** the gap report before building anything — prioritize by how often each trigger type actually fires on real Podcast/Consultancy test content, not by how interesting the component is to build.

---

## PHASE 2 — Build Priority Missing Components

Based on Phase 1's real-usage-frequency ranking, build the highest-priority gaps first. Likely candidates given your two primary test content types:

**Podcast pillar:**
- **Topic Title Card** — a clean, theme-driven full-frame card (topic label + subtle background motion) used whenever a `topic_shift` trigger fires but no B-roll clears the confidence threshold. This directly replaces "silent gap" with an intentional, still-on-brand visual.
- **Icon-Based Point Callout** — a small animated icon + short label, for moments where a spoken list item or key point is emphasized but doesn't warrant a full metric card.

**Consultancy pillar:**
- **Bullet/List Reveal** — sequential animated list items (using the existing `elegant_glide` curve), for spoken enumerations ("three reasons this matters...").
- **Comparison Table** — two/three-column themed table for `comparison_phrase` triggers, as an alternative to a chart when the data isn't numeric.
- **Pull-Quote Card** — a clean, full-frame styled quote card for `high_emphasis_moment` triggers, usable across both Podcast and Consultancy.

Build each following the existing atomic component discipline (Determinism Law, theme-token-driven, correct layer-depth band, entry/exit animation pair).

⏸️ **Stop and confirm** each new component renders correctly and pulls from `ThemeToken`/`GradeToken` before moving to the next.

---

## PHASE 3 — Fallback Guarantee Implementation

Extend Trigger Resolution (Director Engine Phase 5) with a fallback chain per trigger type:

```
For each realized trigger:
  1. Try the ideal component/asset for this trigger type.
  2. If unavailable or below confidence (e.g. B-roll match < 0.45), try the next fallback tier.
  3. If no tiers remain, render the universal fallback: a themed Topic Title Card
     or Pull-Quote Card (whichever fits the trigger's transcript content better),
     never nothing.
  4. Log which tier was actually used on the TriggerLogEntry, so this is inspectable
     later (per the existing Trigger-Driven Assembly Law).
```

⏸️ **Stop and confirm** by deliberately testing a trigger scenario where the ideal component/asset is unavailable (e.g. mock a B-roll search returning no results above threshold) and confirming a fallback renders instead of a gap.

---

## PHASE 4 — Style Depth Audit & Fix

1. Trace the current style-cloning pipeline (`brand_theme_service.py`, style extraction/intelligence) end to end: does its output actually populate `GradeToken` fields and `motion.defaultCurve`, or only `colors`/`typography`?
2. If grade/motion aren't currently derived from cloned style, extend the extraction to infer them — e.g. a fast-cut, high-energy reference video should inform a punchier `defaultCurve` and higher-contrast grade, not just a color palette.
3. Extend B-roll search queries to append style-derived mood keywords (e.g. "corporate," "warm," "minimalist") drawn from the resolved theme, so B-roll selection is visually consistent with the cloned style, not just topically relevant.
4. Add a validation check: after style resolution, confirm every themeable field in `ThemeToken`/`GradeToken` was actually set from the source (manual or scraped/cloned) rather than silently falling back to `DEFAULT_THEME` for fields the extraction pipeline forgot to populate.

⏸️ **Stop and confirm** with a real style-cloning test: confirm grade and pacing visibly reflect the reference style, not just colors, on an exported test clip.

---

## PHASE 5 — B-Roll Match Quality & Threshold Validation

1. Address the documented known limitation directly: the 0.75/0.45 asset-matching thresholds have never been validated against real production data. Run match-quality review on a batch of real B-roll placements from actual test uploads (Podcast + Consultancy) and adjust thresholds based on observed precision (are 0.45-confidence matches actually usable, or too often wrong?).
2. Improve query construction: combine topic label + extracted keywords + style mood (Phase 4) rather than a single naive topic-label search.
3. Define the fallback tier for B-roll specifically: if no clip clears even the partial threshold, fall back to the Topic Title Card (Phase 2) rather than either skipping the visual or using a poor-confidence clip anyway.

⏸️ **Stop and confirm** by reviewing B-roll placements on a real 30+ minute Podcast and a real Consultancy test video, checking each placement's actual relevance against its recorded confidence score.

---

## PHASE 6 — Pre-Export Readiness Gate

Build the completeness check from the Pre-Export Completeness Gate Law:

1. Scan the compiled `DirectorTimeline` for: any stretch longer than a defined threshold (e.g. 45 seconds) with no motion graphics, B-roll, or camera motion change — visually static stretches a non-editor wouldn't know to fix themselves.
2. Flag any `BRollEntry` below the (now-validated) confidence threshold that wasn't caught by the Phase 3 fallback chain.
3. Flag any `suppressed` `TriggerLogEntry` with high confidence that has no nearby fallback rendered.
4. Where auto-resolvable (e.g. a long static stretch can get an automatic Ken Burns pan or a Topic Title Card inserted), resolve it automatically and log it.
5. Where not auto-resolvable, surface a short, specific checklist to the user before export: *"2 segments have no visual variety for 45+ seconds — want me to add B-roll or a title card automatically?"* — one-tap fix, not a wall of technical warnings.

⏸️ **Stop and confirm** by running this gate against a real full Podcast and a real full Consultancy export and confirming it either auto-resolves or clearly flags every real gap found in earlier phases' testing.

---

## PHASE 7 — Full Real-Video Validation

Run one complete real Podcast upload and one complete real Consultancy upload through the entire pipeline — upload → Director compile → completeness gate → export — with **zero manual intervention** from you. This is the actual test of whether this spec succeeded: does the exported file need manual finishing, or is it genuinely done?

⏸️ **Stop and confirm** both exports are usable as-is. If either still needs manual finishing, identify exactly what's missing and treat it as a new, specific gap to close — not a reason to lower the bar on this phase.

---

## Execution Directives

- **This is fundamentally about honesty, not just coverage.** The Fallback Guarantee Law and the Pre-Export Gate exist because "the system tried its best silently" is worse for a non-editor than "the system tells you exactly what it couldn't fully handle." Both failure modes are real right now; only one of them is acceptable.
- **Prioritize by real trigger frequency**, not component novelty — build what actually fires often on your two primary content types first.
- **Don't validate B-roll thresholds on synthetic data** — use real placements from real uploads, since threshold tuning is exactly the kind of thing that looks fine on a clean test video and falls apart on messy real content.
- Update `motion-graphics.md` and `director-engine.md` with the coverage audit results, the new fallback components, the style depth fixes, and the validated B-roll thresholds.