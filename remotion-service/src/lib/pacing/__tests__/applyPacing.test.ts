import { describe, expect, it } from "vitest";
import { PACING_PRESETS } from "@lib/pacing/pacingProfile";
import {
  buildSegmentsFromCuts,
  countCutPoints,
  silenceCutPoints,
  speedRampAtFrame,
} from "@lib/pacing/applyPacing";

describe("pacing presets", () => {
  const silences = [
    { start: 2, end: 4.5 },
    { start: 10, end: 11.2 },
    { start: 20, end: 21.5 },
  ];

  it("relaxed trims fewer silences than aggressive", () => {
    const relaxed = countCutPoints(silenceCutPoints(silences, PACING_PRESETS.relaxed));
    const aggressive = countCutPoints(silenceCutPoints(silences, PACING_PRESETS.aggressive));
    expect(relaxed).toBeLessThan(aggressive);
  });

  it("buildSegmentsFromCuts respects minClipDurationFrames", () => {
    const cuts = silenceCutPoints(silences, PACING_PRESETS.balanced);
    const segments = buildSegmentsFromCuts(30, cuts, 30, 30);
    for (const seg of segments) {
      expect(seg.durationInFrames).toBeGreaterThanOrEqual(30);
    }
  });

  it("speedRampAtFrame eases in and out — never instant jump", () => {
    const start = speedRampAtFrame(0, 30, 1.6, 6, 6);
    const mid = speedRampAtFrame(15, 30, 1.6, 6, 6);
    const end = speedRampAtFrame(29, 30, 1.6, 6, 6);
    expect(start).toBe(1);
    expect(mid).toBeGreaterThan(1);
    expect(end).toBeCloseTo(1, 0);
  });
});
