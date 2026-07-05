export const AUDIO_ANALYSIS_SCHEMA_VERSION = 1;

export type AudioAnalysisPath = "client_visualizeAudio" | "server_librosa";

export interface AudioAnalysisFrame {
  frame: number;
  /** 0–1, normalized to this track's own dynamic range. */
  overallAmplitude: number;
  /** Perceptually-bucketed energy, e.g. 16 bars, 0–1 each. */
  bands: number[];
  /** True on detected onset/beat frames. */
  isTransient: boolean;
}

export interface AudioAnalysisTrack {
  schemaVersion: number;
  /** Content hash of the source audio — cache invalidation key. */
  sourceHash: string;
  fps: number;
  bandCount: number;
  /** One entry per frame of the target composition. */
  frames: AudioAnalysisFrame[];
  /** Whole-track peak used for normalization (not per-frame). */
  peakAmplitude: number;
  meta: {
    analysisPath: AudioAnalysisPath;
    generatedAt: string;
  };
}
