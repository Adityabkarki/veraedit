# ViraEdit Director-Styled Shorts & Sizzle — Master Cursor Composer Prompt

> Right now, Shorts extraction (viral clip detection, platform scoring, vertical export) and the Director Engine (signal-driven motion graphics, cuts, grade, audio) are two separate pipelines. A Short gets platform-scored and vertically cropped, but never gets kinetic captions, beat-synced transitions, or the Social pillar's grade — the exact richness the Director Engine already produces for full-length content. This spec routes every Short/Sizzle output through the Director pipeline so an extracted clip is a fully styled, platform-ready video, not a raw crop with a caption burned in.

---

## Role & Operational Protocol

You are continuing as the Staff Creative Engineer on ViraEdit. The Shorts pipeline (`shorts` table, viral scoring, platform-specific scoring) and the Director Engine (`director_timelines` table, four content pillars, full render bridge) currently never talk to each other. Your task is to make every generated Short/Sizzle clip pass through Director compilation and the DirectorRender composition before export, reusing as much of the parent video's existing analysis as possible rather than recomputing everything from scratch.

Follow the phases in order. Pause at every ⏸️ checkpoint.

---

## PHASE 0 — Extend `skills.md`

### The Timeline Slicing Determinism Law
Slicing a parent `DirectorTimeline` down to a Short's `[startTime, endTime]` window is a pure function of `(parentTimeline, startFrame, endFrame)` — frame remapping, entry filtering, and boundary handling must produce identical output every time, with no live recomputation of already-resolved triggers during slicing itself.

### The Re-Skin Consistency Law
When a sliced clip is re-skinned into a different pillar than its parent (e.g. a Consultancy long-form video producing a Social-styled Short), pacing, grade, and caption style are **fully replaced** by the target pillar's Director rules — never a partial blend of old and new styling. Content-driven decisions (which stat got a metric card, which topic got B-roll) may be retained if their originating trigger's transcript window falls entirely inside the clip; a trigger whose window is cut in half by the clip boundary is dropped, not rendered truncated.

### The Platform Variant Law
Multiple platform-targeted outputs (YouTube Shorts, Instagram Reels, TikTok, LinkedIn) from the same underlying clip are produced from **one** signal-extraction + compile pass, varying only in render-time parameters (CTA badge presence/style, caption density, end-card) — never by re-running full Director signal extraction once per platform.

⏸️ **Stop and confirm** these three laws are written before proceeding.

---

## PHASE 1 — Timeline Slicing

Build `@lib/director/sliceTimeline.ts`:

```typescript
export interface SliceOptions {
  parentTimeline: DirectorTimeline;
  startFrame: number;
  endFrame: number;
  targetContentType: 'podcast' | 'consultancy' | 'social' | 'showcase'; // usually 'social' for Shorts
}

export function sliceTimeline(opts: SliceOptions): DirectorTimeline {
  // 1. Remap all frame numbers in every track entry to be relative to `startFrame` (new frame 0).
  // 2. Drop any entry entirely outside [startFrame, endFrame].
  // 3. For entries partially overlapping the boundary: if it's a hard content entry
  //    (MotionGraphicsEntry, BRollEntry) whose *trigger window* is truncated, drop it
  //    per the Re-Skin Consistency Law. If it's a continuous track (video/audio clip),
  //    trim it to the boundary instead of dropping it.
  // 4. Do NOT resolve new triggers here — that happens in Phase 2/3 if re-skinning is needed.
}
```

**Reuse-first principle:** if `targetContentType` matches the parent's `contentType`, the sliced Timeline can often be used close to as-is (just trimmed) — no full re-skin needed. Re-skinning (Phase 3) is only required when the target pillar differs from the parent, which is the common case for Shorts (parent is often Podcast/Consultancy, target is Social).

⏸️ **Stop and confirm** slicing produces a valid, correctly-trimmed `DirectorTimeline` for a test time range before proceeding.

---

## PHASE 2 — Handle the "No Parent DirectorTimeline" Case

Some Shorts/Sizzle candidates may be generated from raw footage that was never run through Director compilation (Shorts extraction, per the docs, predates the Director Engine and may still run independently). Build the fallback path:

1. If no `DirectorTimeline` exists for the parent project, run signal extraction (topic/stat/emphasis/etc.) scoped **only** to the clip's transcript window, not the whole video — this is cheap since it's a short window.
2. Feed that scoped signal set directly into the target pillar's Director (usually Social) to produce a fresh `DirectorTimeline` for just that clip.
3. **Reuse the Shorts pipeline's existing hook/retention scoring** as the `hook_phrase` trigger's confidence source instead of recomputing emphasis scoring independently — the viral clip detection already did this analysis; don't duplicate it. Tag it `confidenceSource: 'ml'` per the Honest Confidence Law, since it's the actual retention model's output, not a heuristic guess.

⏸️ **Stop and confirm** this fallback path produces a valid `DirectorTimeline` for a clip whose parent has no existing Director compilation.

---

## PHASE 3 — Re-Skinning to the Target Pillar

Build `@lib/director/reskinTimeline.ts` for the case where `targetContentType !== parentTimeline.contentType`:

1. **Replace pacing** — drop the parent's `PacingProfile` and apply the target pillar's default (Social → `aggressive`, per the Cuts & Motion Engine).
2. **Replace grade** — apply the target pillar's `GradeToken` from `GRADE_PRESETS`, not the parent's, while still respecting the project's brand `ThemeToken` overrides (colors/fonts persist across pillars — grade and pacing personality do not).
3. **Replace caption style** — Social pillar mandates Kinetic Karaoke Text on every word (per the existing Social Director rule); this replaces whatever caption style the parent used, even if the parent was Podcast/Consultancy with standard captions.
4. **Retain qualifying content entries** — B-roll and motion-graphics entries whose trigger window survived slicing intact (Phase 1) are kept but re-themed (new grade, new layer styling) rather than re-triggered from scratch.
5. **Re-run transition/camera-motion assignment** for the clip using the target pillar's Cuts & Motion defaults (e.g. `whip_pan`/`glitch_cut` on `isTransient` beats for Social) — the parent's transition choices don't carry over, since they were tuned for a different pacing profile.

⏸️ **Stop and confirm** a re-skinned Social-pillar Short from a Consultancy-parent test video visibly shows kinetic captions, aggressive cuts, and the Social grade — not leftover Consultancy styling — before proceeding.

---

## PHASE 4 — Platform Variants

Extend the Shorts schema (`shorts` table already has `platform_scores`) to drive render-time variation, not re-compilation:

```typescript
export interface PlatformRenderVariant {
  platform: 'youtube' | 'instagram' | 'tiktok' | 'linkedin';
  showCtaBadge: boolean;       // e.g. true for TikTok/Instagram, false for LinkedIn
  captionDensity: 'full_karaoke' | 'reduced'; // LinkedIn audiences often watch with sound on in feed — reduce caption aggressiveness
  endCardStyle: 'follow_prompt' | 'none';
}
```

For each platform the Short is targeting (from `platform_scores`), render using the **same compiled, re-skinned `DirectorTimeline`** with only these variant parameters swapped at render time — satisfies the Platform Variant Law.

⏸️ **Stop and confirm** a TikTok variant and a LinkedIn variant of the same Short both render successfully with visibly different CTA/caption treatment but identical underlying cuts and grade.

---

## PHASE 5 — Vertical Safe-Zone Compliance

Shorts are 9:16. Confirm the existing face-tracking/center-crop reframing logic (documented as a known limitation — "wide shots/B-roll without faces → center crop fallback") produces a frame that the Director's motion graphics layer then composites onto **correctly respecting the 9:16 safe zones** (bottom 15%, right 10%) already defined in `skills.md` — this matters more now than before, since kinetic captions and CTA badges are being added on top of a reframed shot, not just a caption burned into raw 16:9 footage.

⏸️ **Stop and confirm** no caption/badge is visually clipped or covered by platform UI chrome on a real reframed vertical test export.

---

## PHASE 6 — Wire Into the Shorts/Sizzle Endpoints

1. `POST /shorts` and `POST /sizzle generate` — after clip boundaries are selected (existing viral scoring logic, unchanged), call `sliceTimeline()` (Phase 1) or the fallback path (Phase 2), then `reskinTimeline()` (Phase 3) if needed.
2. Route the resulting `DirectorTimeline` through the **same render bridge fix** from the Production Integration spec (`POST /render-director`, not the generic FFmpeg-cuts path) — this is the same preview/export parity discipline, now applied to Shorts specifically. Confirm Shorts don't fall into the same "export missing motion graphics" bug the main pipeline just had.
3. Render one file per requested platform variant (Phase 4).

⏸️ **Stop and confirm** end-to-end: select a viral moment from a real long-form test video → generate a Short → confirm the exported file (not the preview, the actual file) shows kinetic captions, Social grade, beat-synced cuts, and platform-appropriate CTA — before considering this complete.

---

## Execution Directives

- **Reuse over recompute, everywhere possible** — hook scoring, retention analysis, and any content-driven trigger that survives slicing should never be redone from scratch. This keeps Shorts generation fast, which matters since users will generate many candidates per upload.
- **Verify against the same render-bridge bug you just fixed** — Shorts export is a second, easy-to-miss place the same "preview shows it, export doesn't" failure could recur if it's wired to a different render path than the main Director pipeline.
- **Test the re-skin specifically on a Consultancy-or-Podcast-parent → Social-Short case** — that's the scenario where old styling leaking through would be most obviously wrong (a "professional glide" pacing on what should be a punchy TikTok cut).
- Update `director-engine.md` with the slicing/re-skinning logic, the platform variant table, and a before/after example: raw Short extraction vs. Director-styled Short, on the same source clip.