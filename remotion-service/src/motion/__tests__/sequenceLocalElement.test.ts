/**
 * Phase 17 — Sequence-local re-basing regression.
 *
 * Elements are wrapped in <Sequence from={startFrame}> where useCurrentFrame()
 * is local, but element bounds are absolute timeline seconds. Without
 * re-basing, any element with startSeconds > its own duration never activates
 * in a real Director export.
 */
import { describe, expect, it } from "vitest";
import { elementLocalTime, toSequenceLocalElement } from "../motionMath";

describe("toSequenceLocalElement", () => {
  it("re-bases bounds to zero, preserving duration", () => {
    const el = { startSeconds: 6.33, endSeconds: 9.0, id: "x", props: { a: 1 } };
    const local = toSequenceLocalElement(el);
    expect(local.startSeconds).toBe(0);
    expect(local.endSeconds).toBeCloseTo(2.67, 5);
    expect(local.id).toBe("x");
    expect(local.props).toEqual({ a: 1 });
  });

  it("a late element is active at local time after re-basing", () => {
    // Absolute: starts at 190/30 ≈ 6.33s, lasts 80/30 ≈ 2.67s.
    const el = { startSeconds: 190 / 30, endSeconds: 270 / 30 };
    // Local frame 20 → t = 0.667s: inactive under absolute bounds…
    expect(elementLocalTime(20 / 30, el.startSeconds, el.endSeconds).active).toBe(false);
    // …active once re-based.
    const local = toSequenceLocalElement(el);
    expect(elementLocalTime(20 / 30, local.startSeconds, local.endSeconds).active).toBe(true);
  });

  it("never produces a zero or negative duration", () => {
    const local = toSequenceLocalElement({ startSeconds: 5, endSeconds: 5 });
    expect(local.endSeconds).toBeGreaterThan(0);
  });
});
