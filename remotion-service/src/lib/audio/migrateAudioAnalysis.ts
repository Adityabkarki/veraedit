import {
  AUDIO_ANALYSIS_SCHEMA_VERSION,
  type AudioAnalysisFrame,
  type AudioAnalysisTrack,
} from "@types/audio-analysis";

type LegacyAudioAnalysisV0 = {
  schemaVersion?: number;
  sourceHash?: string;
  fps?: number;
  bandCount?: number;
  frames?: AudioAnalysisFrame[];
  peakAmplitude?: number;
  meta?: AudioAnalysisTrack["meta"];
};

/**
 * Pure migration — upgrades stored audio analysis sidecars to the current schema.
 */
export function migrateAudioAnalysis(raw: unknown): AudioAnalysisTrack | null {
  if (!raw || typeof raw !== "object") return null;

  const v =
    "schemaVersion" in raw
      ? Number((raw as { schemaVersion?: number }).schemaVersion)
      : 0;

  if (v >= AUDIO_ANALYSIS_SCHEMA_VERSION) {
    const track = raw as AudioAnalysisTrack;
    if (
      typeof track.sourceHash === "string" &&
      Array.isArray(track.frames) &&
      typeof track.fps === "number" &&
      typeof track.bandCount === "number"
    ) {
      return track;
    }
    return null;
  }

  if (v === 0 || v < 1) {
    const legacy = raw as LegacyAudioAnalysisV0;
    if (!Array.isArray(legacy.frames) || legacy.frames.length === 0) {
      return null;
    }
    return {
      schemaVersion: AUDIO_ANALYSIS_SCHEMA_VERSION,
      sourceHash: legacy.sourceHash ?? "unknown",
      fps: legacy.fps ?? 30,
      bandCount: legacy.bandCount ?? 16,
      frames: legacy.frames,
      peakAmplitude: legacy.peakAmplitude ?? 1,
      meta: legacy.meta ?? {
        analysisPath: "client_visualizeAudio",
        generatedAt: new Date(0).toISOString(),
      },
    };
  }

  console.warn(
    `[migrateAudioAnalysis] Unknown schemaVersion ${v} — discarding track`,
  );
  return null;
}
