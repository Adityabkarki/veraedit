import { describe, expect, it } from "vitest";
import {
  decodeAnalysisTrackBytes,
  encodeAnalysisTrack,
} from "../encodeAnalysisTrack";
import type { AudioAnalysisTrack } from "@types/audio-analysis";

function sampleTrack(frameCount: number, bandCount: number): AudioAnalysisTrack {
  const frames = Array.from({ length: frameCount }, (_, i) => ({
    frame: i,
    overallAmplitude: (i % 10) / 10,
    bands: Array.from({ length: bandCount }, (_, b) => ((i + b) % 256) / 255),
    isTransient: i % 11 === 0,
  }));
  return {
    schemaVersion: 1,
    sourceHash: "test",
    fps: 30,
    bandCount,
    frames,
    peakAmplitude: 1,
    meta: { analysisPath: "server_librosa", generatedAt: "2026-01-01" },
  };
}

describe("encodeAnalysisTrack", () => {
  it("round-trips frame data", () => {
    const track = sampleTrack(90, 8);
    const encoded = encodeAnalysisTrack(track);
    const decoded = decodeAnalysisTrackBytes(
      encoded,
      track.meta,
      track.sourceHash,
    );
    expect(decoded?.frames.length).toBe(90);
    expect(decoded?.frames[0].overallAmplitude).toBeCloseTo(
      track.frames[0].overallAmplitude,
      2,
    );
    expect(decoded?.frames[11].isTransient).toBe(true);
  });

  it("is much smaller than JSON for long tracks", () => {
    const track = sampleTrack(3000, 16);
    const encoded = encodeAnalysisTrack(track);
    const jsonLen = JSON.stringify(track).length;
    expect(encoded.byteLength).toBeLessThan(jsonLen * 0.5);
  });
});
