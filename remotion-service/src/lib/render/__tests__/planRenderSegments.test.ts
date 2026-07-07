import { describe, expect, it } from "vitest";
import type { DirectorTimeline } from "@types/timeline";
import { estimateRender } from "../estimateRender";
import {
  DEFAULT_TARGET_SEGMENT_MINUTES,
  planRenderSegments,
  RENDER_SEGMENT_THRESHOLD_MINUTES,
} from "../planRenderSegments";
import { buildConcatFileLines } from "../stitchSegments";

function longTimeline(minutes: number, fps = 30): DirectorTimeline {
  const durationInFrames = minutes * 60 * fps;
  const clipLen = 5 * 60 * fps;
  const video = [];
  const transitions = [];
  let t = 0;
  let idx = 0;
  while (t < durationInFrames) {
    const end = Math.min(t + clipLen, durationInFrames);
    video.push({
      id: `v${idx}`,
      assetId: "a1",
      startFrame: t,
      durationInFrames: end - t,
      sourceStartSeconds: 0,
      sourceEndSeconds: (end - t) / fps,
      speed: 1,
    });
    if (idx > 0) {
      transitions.push({
        id: `tr${idx}`,
        type: "fade",
        atFrame: t,
        durationInFrames: fps,
        easing: "linear",
      });
    }
    t = end;
    idx += 1;
  }
  return {
    schemaVersion: 1,
    projectId: "p1",
    contentType: "podcast",
    fps,
    durationInFrames,
    width: 1920,
    height: 1080,
    theme: {} as DirectorTimeline["theme"],
    tracks: {
      video,
      audio: [],
      captions: [],
      broll: [],
      motionGraphics: [],
      transitions,
      vfx: [],
      sfx: [],
      multicam: [],
    },
    triggers: [],
  };
}

describe("planRenderSegments", () => {
  it("returns single segment below threshold", () => {
    const tl = longTimeline(RENDER_SEGMENT_THRESHOLD_MINUTES - 1);
    const segs = planRenderSegments(tl);
    expect(segs).toHaveLength(1);
    expect(segs[0].startFrame).toBe(0);
  });

  it("splits 90-minute timeline into multiple segments", () => {
    const tl = longTimeline(90);
    const segs = planRenderSegments(tl, DEFAULT_TARGET_SEGMENT_MINUTES);
    expect(segs.length).toBeGreaterThan(10);
    expect(segs[segs.length - 1].endFrame).toBe(tl.durationInFrames - 1);
  });
});

describe("estimateRender", () => {
  it("returns higher estimate for complex long timelines", () => {
    const tl = longTimeline(60);
    tl.tracks.motionGraphics = Array.from({ length: 30 }, (_, i) => ({
      id: `mg${i}`,
      componentId: "stat_card",
      startFrame: i * 100,
      durationInFrames: 90,
      layerDepth: 1,
      props: {},
      triggerId: `t${i}`,
    }));
    const est = estimateRender(tl);
    expect(est.segmentCount).toBeGreaterThan(1);
    expect(est.estimatedWallClockSeconds).toBeGreaterThan(120);
  });
});

describe("stitchSegments", () => {
  it("builds ffmpeg concat list in order", () => {
    const lines = buildConcatFileLines([
      { segmentIndex: 1, storageKey: "b.mp4", localPath: "/tmp/b.mp4" },
      { segmentIndex: 0, storageKey: "a.mp4", localPath: "/tmp/a.mp4" },
    ]);
    expect(lines.indexOf("a.mp4")).toBeLessThan(lines.indexOf("b.mp4"));
  });
});
