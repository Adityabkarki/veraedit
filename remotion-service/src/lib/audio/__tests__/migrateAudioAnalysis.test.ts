import { describe, expect, it } from "vitest";
import { migrateAudioAnalysis } from "../migrateAudioAnalysis";

describe("migrateAudioAnalysis", () => {
  it("passes through v1 tracks", () => {
    const track = {
      schemaVersion: 1,
      sourceHash: "abc",
      fps: 30,
      bandCount: 16,
      frames: [{ frame: 0, overallAmplitude: 0.5, bands: [0.5], isTransient: false }],
      peakAmplitude: 0.5,
      meta: { analysisPath: "server_librosa" as const, generatedAt: "2026-01-01" },
    };
    expect(migrateAudioAnalysis(track)).toEqual(track);
  });

  it("upgrades v0 legacy tracks", () => {
    const legacy = {
      frames: [{ frame: 0, overallAmplitude: 0.3, bands: [0.3], isTransient: false }],
      fps: 24,
    };
    const migrated = migrateAudioAnalysis(legacy);
    expect(migrated?.schemaVersion).toBe(1);
    expect(migrated?.fps).toBe(24);
  });
});
