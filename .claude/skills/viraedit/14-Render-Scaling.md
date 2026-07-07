# ViraEdit Long-Form Render Scaling Engine — Master Cursor Composer Prompt

> Covers: chunked parallel rendering, lossless stitching, resumable render jobs, and pre-export time/cost estimation. Rendering a 90-minute Director composition frame-by-frame in headless Chromium as one continuous job is slow and fragile — a crash near the end loses all progress. This spec splits long renders into parallel, resumable segments.

---

## Role & Operational Protocol

You are continuing as the Staff Creative Engineer on ViraEdit. The render pipeline currently treats an export as one monolithic job regardless of length. For long-form content this means long wall-clock render times, no resilience to mid-render failure, and no way to warn a user upfront about how long/expensive their export will be. Your task is to split long renders into parallel segments aligned to safe cut points, stitch them losslessly, make failures resumable per-segment, and add an upfront estimate.

Follow the phases in order. Pause at every ⏸️ checkpoint.

---

## PHASE 0 — Extend `skills.md`

### The Segment Boundary Alignment Law
When a render is split into parallel segments, boundaries must align with existing hard cut points or fall entirely outside any active transition window in the Timeline — never split mid-transition or mid-clip. A transition is one atomic unit; it belongs entirely to one render segment.

### The Render Resumability Law
Every render segment's completion status and output location are persisted independently. A failed or retried render only re-runs the segments that failed — never restarts the whole export from zero, regardless of video length.

⏸️ **Stop and confirm** both laws are written before proceeding.

---

## PHASE 1 — Segment Planning

Build `@lib/render/planRenderSegments.ts`:

```typescript
export interface RenderSegment {
  segmentIndex: number;
  startFrame: number;
  endFrame: number;
}

export function planRenderSegments(timeline: DirectorTimeline, targetSegmentMinutes = 4): RenderSegment[] {
  // Only split if durationInFrames exceeds a threshold (e.g. 10 minutes worth of frames).
  // Below threshold: return a single segment covering the whole timeline — no behavior change for short/medium exports.
  // Above threshold: find candidate split points near multiples of targetSegmentMinutes,
  // snapped to the nearest point that is NOT inside a TransitionEntry's frame range
  // and NOT inside a VideoClipEntry (only split between clips, or at a hard_cut boundary).
}
```

⏸️ **Stop and confirm** segment planning produces sane, transition-respecting split points for a real 90-minute test project's compiled Timeline before proceeding.

---

## PHASE 2 — Parallel Render Dispatch & Resumable Status

1. Extend the `renders` table (or add a `render_segments` child table) with per-segment status: `pending | rendering | complete | failed`, plus `outputStorageKey` once complete.
2. Dispatch each segment as its own Celery task (a `group`), each calling the Remotion render for just its `[startFrame, endFrame]` range — reference Remotion's own `concurrency` option in `renderMedia()` as the grounding mechanism for parallel frame-range rendering rather than hand-rolling process management.
3. On any segment failure, mark only that segment `failed`; a retry action re-dispatches only failed segments, per the Render Resumability Law — completed segments' outputs are already in MinIO and are reused as-is.
4. A parent job tracks overall progress as `completedSegments / totalSegments`, feeding the existing WebSocket render-progress events.

⏸️ **Stop and confirm** by simulating a mid-render worker crash on one segment of a real long test render and confirming a retry only re-renders that segment, not the whole video.

---

## PHASE 3 — Stitching

Build `@lib/render/stitchSegments.ts`: once all segments for a render job are `complete`, concatenate their output files via FFmpeg concat (lossless, since all segments share identical codec/params by construction — they all came from the same Remotion composition/settings).

**Verify audio continuity across segment joins** — segment boundaries were chosen to respect visual cut points (Phase 1), but confirm the audio track (including any music bed and ducking envelope) doesn't pop, click, or discontinue at the stitch point. If needed, render a small crossfade-safe overlap in the audio track specifically at segment joins, distinct from the visual segment boundary.

⏸️ **Stop and confirm** a stitched real 90-minute export has no visible seam and no audible pop/discontinuity at any segment join, checked at every boundary, not just the first one.

---

## PHASE 4 — Pre-Export Time & Cost Estimate

Build `@lib/render/estimateRender.ts`:

1. Estimate wall-clock render time from: video duration, number of active motion-graphics/VFX layers (more composited layers per frame = slower Chromium render), and historical render-time data from past jobs of similar composition complexity (track this as you go — start with a rough duration-based heuristic and refine using real observed render times).
2. If rendering runs on paid infrastructure (cloud GPU/Lambda-style compute), estimate cost the same way the AI budget system already tracks LLM cost — surface both figures to the user before they commit to export.
3. Offer the user a choice consistent with the existing WebSocket progress system: render now and wait, or render in the background with a completion notification — this matters more for long-form content where a 90-minute export might take a genuinely long time.

⏸️ **Stop and confirm** the estimate is reasonably close (order-of-magnitude, not exact) to actual observed render time on a few real test exports of varying length/complexity before shipping this estimate to users.

---

## Execution Directives

- **Verify the single-segment no-op path first** — a short Social clip export should behave exactly as it does today, with zero added latency from segment planning overhead.
- **Audio continuity at stitch points is the easiest thing to get subtly wrong here** — a video-only seam check isn't enough; listen through every join on a real long export, don't just check the waveform visually.
- Update `director-engine.md` with the segment planning rules, the resumability model, and the estimate methodology.