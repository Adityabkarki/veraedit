/**
 * Pre-export render time and cost estimation (Phase 14).
 */
import type { DirectorTimeline } from "@types/timeline";
import { planRenderSegments } from "./planRenderSegments";

export interface RenderEstimate {
  durationSeconds: number;
  segmentCount: number;
  estimatedWallClockSeconds: number;
  estimatedCostUsd: number;
  complexityScore: number;
  methodology: string;
}

export interface EstimateRenderOptions {
  /** Observed seconds of render per minute of output from past jobs. */
  secondsPerOutputMinute?: number;
  /** USD per minute of wall-clock render on paid infra (0 = local). */
  usdPerRenderMinute?: number;
}

const DEFAULT_SECONDS_PER_OUTPUT_MINUTE = 45;
const PARALLEL_SEGMENT_SPEEDUP = 0.65;

function countLayers(timeline: DirectorTimeline): number {
  const tracks = timeline.tracks ?? {};
  return (
    (tracks.motionGraphics?.length ?? 0) +
    (tracks.vfx?.length ?? 0) +
    (tracks.broll?.length ?? 0) +
    (tracks.captions?.length ?? 0)
  );
}

export function estimateRender(
  timeline: DirectorTimeline,
  options?: EstimateRenderOptions,
): RenderEstimate {
  const fps = Number(timeline.fps) || 30;
  const durationSeconds =
    Number(timeline.durationInFrames) / fps ||
    Number((timeline as { durationSeconds?: number }).durationSeconds) ||
    0;
  const durationMinutes = durationSeconds / 60;
  const layers = countLayers(timeline);
  const complexityScore = 1 + layers / 80;
  const segments = planRenderSegments(timeline);
  const baseSecondsPerMinute =
    options?.secondsPerOutputMinute ?? DEFAULT_SECONDS_PER_OUTPUT_MINUTE;

  let wallClock =
    durationMinutes * baseSecondsPerMinute * complexityScore;
  if (segments.length > 1) {
    wallClock =
      (wallClock / segments.length) * PARALLEL_SEGMENT_SPEEDUP * segments.length;
  }

  const usdPerMinute = options?.usdPerRenderMinute ?? 0;
  const estimatedCostUsd = (wallClock / 60) * usdPerMinute;

  return {
    durationSeconds,
    segmentCount: segments.length,
    estimatedWallClockSeconds: Math.round(wallClock),
    estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000,
    complexityScore: Math.round(complexityScore * 100) / 100,
    methodology:
      segments.length > 1
        ? "duration × complexity × parallel_segment_factor"
        : "duration × complexity (single segment)",
  };
}
