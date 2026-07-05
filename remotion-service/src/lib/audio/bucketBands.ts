import type { MediaUtilsAudioData } from "@remotion/media-utils";
import { visualizeAudio } from "@remotion/media-utils";
import type { AudioAnalysisFrame } from "@types/audio-analysis";

/** Non-linear response — quiet passages stay visible, loud passages don't clip. */
export function applyResponseCurve(value: number, exponent = 0.7): number {
  const clamped = Math.max(0, Math.min(1, value));
  return Math.pow(clamped, exponent);
}

/**
 * Log-scale frequency bucket boundaries.
 * Maps linear FFT bin indices into perceptually-spaced bands (bass/mid/treble).
 */
export function logBucketRanges(
  binCount: number,
  bandCount: number,
  minHz = 60,
  maxHz = 16000,
): Array<{ startBin: number; endBin: number }> {
  const nyquist = maxHz;
  const ranges: Array<{ startBin: number; endBin: number }> = [];

  for (let b = 0; b < bandCount; b++) {
    const fLow = minHz * Math.pow(maxHz / minHz, b / bandCount);
    const fHigh = minHz * Math.pow(maxHz / minHz, (b + 1) / bandCount);
    const startBin = Math.floor((fLow / nyquist) * binCount);
    const endBin = Math.min(
      binCount,
      Math.max(startBin + 1, Math.ceil((fHigh / nyquist) * binCount)),
    );
    ranges.push({ startBin, endBin });
  }
  return ranges;
}

/** Average energy of raw FFT bins into log-spaced perceptual buckets. */
export function bucketRawBins(
  rawBins: number[],
  bandCount: number,
): number[] {
  const ranges = logBucketRanges(rawBins.length, bandCount);
  return ranges.map(({ startBin, endBin }) => {
    let sum = 0;
    let count = 0;
    for (let i = startBin; i < endBin; i++) {
      sum += rawBins[i] ?? 0;
      count++;
    }
    return count > 0 ? sum / count : 0;
  });
}

const DEFAULT_FFT_SAMPLES = 256;
const DEFAULT_SMOOTH_RADIUS = 2;

/**
 * Deterministic frame-window smoothing — pure function of (audioData, frame).
 * Never reads a previous frame's smoothed value from external state.
 */
export function smoothedVisualizeAudio(
  audioData: MediaUtilsAudioData,
  frame: number,
  fps: number,
  numberOfSamples = DEFAULT_FFT_SAMPLES,
  smoothRadius = DEFAULT_SMOOTH_RADIUS,
): number[] {
  const offsets: number[] = [];
  for (let offset = -smoothRadius; offset <= smoothRadius; offset++) {
    const f = Math.max(0, frame + offset);
    offsets.push(
      ...visualizeAudio({
        audioData,
        frame: f,
        fps,
        numberOfSamples,
        smoothing: false,
      }),
    );
  }
  const binCount = numberOfSamples;
  const windowCount = smoothRadius * 2 + 1;
  const averaged = new Array<number>(binCount).fill(0);
  for (let w = 0; w < windowCount; w++) {
    for (let i = 0; i < binCount; i++) {
      averaged[i] += offsets[w * binCount + i] ?? 0;
    }
  }
  return averaged.map((v) => v / windowCount);
}

/** Full perceptual pipeline: smooth → log-bucket (raw energies, not yet track-normalized). */
export function bucketBandsAtFrame(
  audioData: MediaUtilsAudioData,
  frame: number,
  fps: number,
  bandCount: number,
  numberOfSamples = DEFAULT_FFT_SAMPLES,
): { bands: number[]; overallAmplitude: number } {
  const raw = smoothedVisualizeAudio(
    audioData,
    frame,
    fps,
    numberOfSamples,
    DEFAULT_SMOOTH_RADIUS,
  );
  const bucketed = bucketRawBins(raw, bandCount);
  const overallAmplitude =
    bucketed.reduce((a, b) => a + b, 0) / Math.max(1, bucketed.length);
  return { bands: bucketed, overallAmplitude };
}

export function normalizeFrames(
  frames: AudioAnalysisFrame[],
  peakAmplitude: number,
): AudioAnalysisFrame[] {
  const peak = Math.max(peakAmplitude, 0.0001);
  return frames.map((f) => ({
    ...f,
    overallAmplitude: applyResponseCurve(f.overallAmplitude / peak),
    bands: f.bands.map((b) => applyResponseCurve(b / peak)),
  }));
}
