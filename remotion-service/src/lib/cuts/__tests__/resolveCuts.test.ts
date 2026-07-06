import { describe, expect, it } from "vitest";
import {
  beatCutPoints,
  defaultTransitionForTrigger,
  cameraMotionForSegment,
} from "@lib/cuts/resolveCuts";
import { buildKenBurnsMotion, cameraMotionAtFrame, hashSeed } from "@types/camera-motion";
import { transitionStateAtFrame } from "../../../motion/components/transitions/transitionMath";
import { GLITCH_MAX_FRAMES } from "@types/transitions";

describe("beat cut points", () => {
  it("detects isTransient frames as beat cuts", () => {
    const frames = [
      { frame: 10, isTransient: true },
      { frame: 12, isTransient: true },
      { frame: 30, isTransient: true },
    ];
    const cuts = beatCutPoints(frames, 30);
    expect(cuts.length).toBe(2);
    expect(cuts[0]!.type).toBe("beat");
  });
});

describe("content-type transition defaults", () => {
  it("podcast uses hard_cut on speaker change", () => {
    expect(defaultTransitionForTrigger("podcast", "speaker_change")).toBe("hard_cut");
  });

  it("social uses whip_pan on topic shift", () => {
    expect(defaultTransitionForTrigger("social", "topic_shift")).toBe("whip_pan");
  });

  it("consultancy uses slide on topic shift", () => {
    expect(defaultTransitionForTrigger("consultancy", "topic_shift")).toBe("slide");
  });
});

describe("camera motion determinism", () => {
  it("same clip id produces identical motion across invocations", () => {
    const schema = buildKenBurnsMotion("clip-abc", 0.08);
    const a = cameraMotionAtFrame(schema, 45, 90);
    const b = cameraMotionAtFrame(schema, 45, 90);
    expect(a).toEqual(b);
  });

  it("different clip ids produce different seeds", () => {
    expect(hashSeed("clip-a")).not.toBe(hashSeed("clip-b"));
  });

  it("push_in assigned for podcast talking head", () => {
    const motion = cameraMotionForSegment("c1", "podcast", "talking_head", {
      profile: "relaxed",
      silenceTrimThresholdMs: 1200,
      minClipDurationFrames: 60,
      defaultTransitionDurationFrames: 20,
      maxCameraMotionIntensity: 0.05,
      speedRampOnFiller: false,
    });
    expect(motion?.type).toBe("push_in");
  });
});

describe("transition determinism", () => {
  it("glitch_cut respects flash safety max frames", () => {
    const atFrame = 98;
    const during = transitionStateAtFrame(atFrame + 2, atFrame, 8, "glitch_cut");
    expect(during.glitchOffsetPx).not.toBe(0);
    const after = transitionStateAtFrame(atFrame + GLITCH_MAX_FRAMES, atFrame, 8, "glitch_cut");
    expect(after.incomingOpacity).toBe(1);
  });

  it("crossfade progress is pure function of frame", () => {
    const a = transitionStateAtFrame(50, 40, 20, "crossfade");
    const b = transitionStateAtFrame(50, 40, 20, "crossfade");
    expect(a).toEqual(b);
    expect(a.incomingOpacity).toBeGreaterThan(0);
    expect(a.incomingOpacity).toBeLessThan(1);
  });
});
