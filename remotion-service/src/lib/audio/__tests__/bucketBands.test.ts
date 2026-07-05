import { describe, expect, it } from "vitest";
import type { MediaUtilsAudioData } from "@remotion/media-utils";
import {
  applyResponseCurve,
  bucketRawBins,
  logBucketRanges,
  normalizeFrames,
} from "../bucketBands";
import { buildClientAudioAnalysis } from "../analyzeClient";

function makeSpeechLikeAudio(
  durationSeconds = 10,
  sampleRate = 44100,
): MediaUtilsAudioData {
  const totalSamples = Math.floor(durationSeconds * sampleRate);
  const waveform = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const envelope = 0.2 + 0.8 * Math.max(0, Math.sin(t * Math.PI * 1.6));
    waveform[i] = envelope * Math.sin(2 * Math.PI * 180 * t) * 0.4;
  }
  return {
    channelWaveforms: [waveform],
    sampleRate,
    durationInSeconds: durationSeconds,
    numberOfChannels: 1,
    resultId: "test",
    isRemote: false,
  };
}

describe("logBucketRanges", () => {
  it("produces more bins for treble than bass", () => {
    const ranges = logBucketRanges(256, 16);
    const bassWidth = ranges[0].endBin - ranges[0].startBin;
    const trebleWidth = ranges[15].endBin - ranges[15].startBin;
    expect(trebleWidth).toBeGreaterThanOrEqual(bassWidth);
  });
});

describe("bucketRawBins", () => {
  it("maps linear bins into bandCount buckets", () => {
    const raw = new Array(256).fill(0).map((_, i) => (i < 32 ? 1 : 0));
    const bands = bucketRawBins(raw, 16);
    expect(bands).toHaveLength(16);
    expect(bands[0]).toBeGreaterThan(bands[15]);
  });
});

describe("applyResponseCurve", () => {
  it("boosts quiet values relative to linear", () => {
    expect(applyResponseCurve(0.25)).toBeGreaterThan(0.25);
    expect(applyResponseCurve(1)).toBe(1);
  });
});

describe("buildClientAudioAnalysis", () => {
  it("produces normalized frames with speech-like rhythm", () => {
    const audio = makeSpeechLikeAudio(10, 44100);
    const track = buildClientAudioAnalysis(audio, {
      sourceHash: "testhash",
      fps: 30,
      bandCount: 16,
      durationSeconds: 10,
    });

    expect(track.frames).toHaveLength(300);
    expect(track.peakAmplitude).toBeGreaterThan(0);
    const amps = track.frames.map((f) => f.overallAmplitude);
    const maxAmp = Math.max(...amps);
    const minAmp = Math.min(...amps);
    expect(maxAmp).toBeLessThanOrEqual(1);
    expect(minAmp).toBeGreaterThan(0);
    expect(maxAmp - minAmp).toBeGreaterThan(0.1);
    expect(track.frames.every((f) => f.bands.length === 16)).toBe(true);
  });

  it("is deterministic for the same frame", () => {
    const audio = makeSpeechLikeAudio(5);
    const a = buildClientAudioAnalysis(audio, {
      sourceHash: "x",
      fps: 30,
      bandCount: 8,
      durationSeconds: 5,
    });
    const b = buildClientAudioAnalysis(audio, {
      sourceHash: "x",
      fps: 30,
      bandCount: 8,
      durationSeconds: 5,
    });
    expect(a.frames[42]).toEqual(b.frames[42]);
  });
});

describe("normalizeFrames", () => {
  it("scales against whole-track peak not per-frame", () => {
    const frames = normalizeFrames(
      [
        { frame: 0, overallAmplitude: 0.1, bands: [0.1, 0.2], isTransient: false },
        { frame: 1, overallAmplitude: 0.5, bands: [0.5, 0.4], isTransient: false },
      ],
      0.5,
    );
    expect(frames[0].overallAmplitude).toBeGreaterThan(0.1);
    expect(frames[1].overallAmplitude).toBe(1);
  });
});
