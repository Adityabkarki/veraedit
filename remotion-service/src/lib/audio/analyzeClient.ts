import type { MediaUtilsAudioData } from "@remotion/media-utils";
import {
  AUDIO_ANALYSIS_SCHEMA_VERSION,
  type AudioAnalysisFrame,
  type AudioAnalysisTrack,
} from "@types/audio-analysis";
import {
  bucketBandsAtFrame,
  normalizeFrames,
} from "./bucketBands";
import { applyTransientsToFrames } from "./onsetDetection";

export interface BuildClientAnalysisOptions {
  sourceHash: string;
  fps: number;
  bandCount?: number;
  durationSeconds?: number;
}

/**
 * Path A — build a full AudioAnalysisTrack from decoded @remotion/media-utils buffer.
 * Every frame is a pure function of (audioData, frame).
 */
export function buildClientAudioAnalysis(
  audioData: MediaUtilsAudioData,
  options: BuildClientAnalysisOptions,
): AudioAnalysisTrack {
  const bandCount = options.bandCount ?? 16;
  const fps = options.fps;
  const duration =
    options.durationSeconds ?? audioData.durationInSeconds;
  const totalFrames = Math.max(1, Math.ceil(duration * fps));

  const rawFrames: AudioAnalysisFrame[] = [];
  let peakAmplitude = 0;

  for (let frame = 0; frame < totalFrames; frame++) {
    const { bands, overallAmplitude } = bucketBandsAtFrame(
      audioData,
      frame,
      fps,
      bandCount,
    );
    peakAmplitude = Math.max(
      peakAmplitude,
      overallAmplitude,
      ...bands,
    );
    rawFrames.push({
      frame,
      overallAmplitude,
      bands,
      isTransient: false,
    });
  }

  const normalized = normalizeFrames(rawFrames, peakAmplitude);
  const amplitudes = normalized.map((f) => f.overallAmplitude);
  const withTransients = applyTransientsToFrames(normalized, amplitudes);

  return {
    schemaVersion: AUDIO_ANALYSIS_SCHEMA_VERSION,
    sourceHash: options.sourceHash,
    fps,
    bandCount,
    frames: withTransients,
    peakAmplitude,
    meta: {
      analysisPath: "client_visualizeAudio",
      generatedAt: new Date().toISOString(),
    },
  };
}
