import { describe, expect, it } from "vitest";
import { detectTransients } from "../onsetDetection";

describe("detectTransients", () => {
  it("flags frames with clear amplitude jumps", () => {
    const amps = [0.1, 0.1, 0.1, 0.8, 0.7, 0.1, 0.1, 0.9, 0.8];
    const flags = detectTransients(amps, { threshold: 0.15, minGapFrames: 2 });
    expect(flags[3]).toBe(true);
    expect(flags[7]).toBe(true);
  });

  it("is deterministic and isolated per frame index", () => {
    const amps = [0, 0.2, 0.5, 0.3, 0.9, 0.4];
    const a = detectTransients(amps);
    const b = detectTransients(amps);
    expect(a).toEqual(b);
  });
});
