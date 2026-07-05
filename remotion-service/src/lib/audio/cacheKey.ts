import type { AudioAnalysisTrack } from "@types/audio-analysis";

/** Cache key for AudioAnalysisTrack sidecars — keyed by source + render params. */
export function audioAnalysisCacheKey(
  sourceHash: string,
  fps: number,
  bandCount: number,
): string {
  return `${sourceHash}:${fps}:${bandCount}`;
}

export function audioAnalysisStorageKey(
  projectId: string,
  sourceHash: string,
  fps: number,
  bandCount: number,
): string {
  return `projects/${projectId}/audio-analysis/${sourceHash}_${fps}_${bandCount}.json`;
}

export function isCacheHit(
  cached: AudioAnalysisTrack | null | undefined,
  sourceHash: string,
  fps: number,
  bandCount: number,
): cached is AudioAnalysisTrack {
  if (!cached) return false;
  return (
    cached.sourceHash === sourceHash &&
    cached.fps === fps &&
    cached.bandCount === bandCount
  );
}
