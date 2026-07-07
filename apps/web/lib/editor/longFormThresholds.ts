/**
 * Long-form editor thresholds (Phase 15).
 * Below these: legacy full-timeline behavior — no windowing or diff undo.
 */
export const LONG_FORM_CLIP_COUNT_THRESHOLD = 150;
export const LONG_FORM_DURATION_THRESHOLD_SECONDS = 15 * 60;
export const WINDOW_PREFETCH_SECONDS = 30;

export function shouldUseLongFormOptimizations(
  clipCount: number,
  durationSeconds: number,
): boolean {
  return (
    clipCount > LONG_FORM_CLIP_COUNT_THRESHOLD ||
    durationSeconds > LONG_FORM_DURATION_THRESHOLD_SECONDS
  );
}

export function timelineDurationSeconds(
  clips: Array<{ startTime: number; duration: number }>,
): number {
  if (clips.length === 0) return 0;
  return Math.max(...clips.map((c) => c.startTime + c.duration));
}
