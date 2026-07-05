import type { AudioAnalysisFrame, AudioAnalysisTrack } from "@types/audio-analysis";

export function getAnalysisFrameAt(
  track: AudioAnalysisTrack | null | undefined,
  frame: number,
): AudioAnalysisFrame | null {
  if (!track?.frames?.length) return null;
  const direct = track.frames[frame];
  if (direct) return direct;
  const clamped = Math.max(0, Math.min(frame, track.frames.length - 1));
  return track.frames[clamped] ?? null;
}

export interface SpeakerAnalysisMap {
  [speakerId: string]: AudioAnalysisTrack;
}

const ACTIVE_SPEAKER_THRESHOLD = 0.12;
/**
 * Resolve who's talking from per-channel analysis tracks.
 * Pure function of (frame, speakerAnalysis) — no cross-frame state.
 * Falls back to explicit activeSpeakerId when no analysis is available.
 */
export function resolveActiveSpeakerAtFrame(
  frame: number,
  speakerIds: string[],
  speakerAnalysis: SpeakerAnalysisMap | null | undefined,
  explicitActiveId: string | null | undefined,
): string | null {
  if (!speakerAnalysis || speakerIds.length === 0) {
    return explicitActiveId ?? null;
  }

  let bestId: string | null = null;
  let bestAmp = 0;

  for (const id of speakerIds) {
    const track = speakerAnalysis[id];
    const entry = getAnalysisFrameAt(track, frame);
    const amp = entry?.overallAmplitude ?? 0;
    if (amp > bestAmp) {
      bestAmp = amp;
      bestId = id;
    }
  }

  if (!bestId || bestAmp < ACTIVE_SPEAKER_THRESHOLD) {
    return explicitActiveId ?? null;
  }

  return bestId;
}
