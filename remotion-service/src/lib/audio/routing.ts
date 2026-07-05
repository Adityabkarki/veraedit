/**
 * Audio analysis routing — hybrid client/server strategy.
 *
 * Path A (client): getAudioData + visualizeAudio at composition mount — clips under threshold.
 * Path B (server): librosa precompute sidecar — long-form podcast episodes.
 */

/** Clips at or below this duration use client-side @remotion/media-utils analysis. */
export const CLIENT_ANALYSIS_MAX_SECONDS = 180;

export function shouldUseClientAnalysis(durationSeconds: number): boolean {
  return durationSeconds > 0 && durationSeconds <= CLIENT_ANALYSIS_MAX_SECONDS;
}

export function shouldUseServerAnalysis(durationSeconds: number): boolean {
  return durationSeconds > CLIENT_ANALYSIS_MAX_SECONDS;
}
