/**
 * Long-form analysis chunk planning (Phase 12).
 *
 * Below CHUNK_THRESHOLD_SECONDS: single no-op chunk — short-form behavior unchanged.
 * Above threshold: ~8–10 minute core windows with ~20–30 second overlap on each side.
 */

export const CHUNK_THRESHOLD_SECONDS = 15 * 60;
export const DEFAULT_CHUNK_TARGET_MINUTES = 9;
export const DEFAULT_OVERLAP_SECONDS = 25;

export interface ChunkPlan {
  chunkIndex: number;
  /** Non-overlapping owned region start (seconds). */
  coreStart: number;
  /** Non-overlapping owned region end (seconds). */
  coreEnd: number;
  /** coreStart minus overlap, clamped to 0. */
  windowStart: number;
  /** coreEnd plus overlap, clamped to file duration. */
  windowEnd: number;
}

export interface PlanChunksOptions {
  chunkTargetMinutes?: number;
  overlapSeconds?: number;
  chunkThresholdSeconds?: number;
}

export function planChunks(
  durationSeconds: number,
  options?: PlanChunksOptions,
): ChunkPlan[] {
  const duration = Math.max(0, durationSeconds);
  if (duration === 0) {
    return [
      {
        chunkIndex: 0,
        coreStart: 0,
        coreEnd: 0,
        windowStart: 0,
        windowEnd: 0,
      },
    ];
  }

  const threshold =
    options?.chunkThresholdSeconds ?? CHUNK_THRESHOLD_SECONDS;
  if (duration <= threshold) {
    return [
      {
        chunkIndex: 0,
        coreStart: 0,
        coreEnd: duration,
        windowStart: 0,
        windowEnd: duration,
      },
    ];
  }

  const coreLength =
    (options?.chunkTargetMinutes ?? DEFAULT_CHUNK_TARGET_MINUTES) * 60;
  const overlap = options?.overlapSeconds ?? DEFAULT_OVERLAP_SECONDS;
  const chunks: ChunkPlan[] = [];
  let coreStart = 0;
  let chunkIndex = 0;

  while (coreStart < duration) {
    const coreEnd = Math.min(coreStart + coreLength, duration);
    chunks.push({
      chunkIndex,
      coreStart,
      coreEnd,
      windowStart: Math.max(0, coreStart - overlap),
      windowEnd: Math.min(duration, coreEnd + overlap),
    });
    coreStart = coreEnd;
    chunkIndex += 1;
  }

  return chunks;
}

/** Overlap zone between adjacent chunk windows (for reconciliation). */
export function overlapZone(
  left: ChunkPlan,
  right: ChunkPlan,
): { start: number; end: number } | null {
  const start = Math.max(left.windowStart, right.windowStart);
  const end = Math.min(left.windowEnd, right.windowEnd);
  if (end <= start) {
    return null;
  }
  return { start, end };
}
