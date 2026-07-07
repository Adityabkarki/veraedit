import { describe, expect, it } from "vitest";
import { DEFAULT_THEME } from "@types/theme-tokens";
import type { DirectorTimeline } from "@types/timeline";
import { sliceTimeline } from "../sliceTimeline";

function makeParentTimeline(): DirectorTimeline {
  return {
    schemaVersion: 1,
    projectId: "proj-slice",
    contentType: "consultancy",
    fps: 30,
    durationInFrames: 900,
    width: 1920,
    height: 1080,
    theme: DEFAULT_THEME,
    pacingProfile: "balanced",
    tracks: {
      video: [
        {
          id: "v1",
          assetId: "asset-1",
          startFrame: 0,
          durationInFrames: 900,
          sourceStartSeconds: 0,
          sourceEndSeconds: 30,
          speed: 1,
        },
      ],
      audio: [],
      captions: [
        {
          id: "cap-1",
          startFrame: 60,
          endFrame: 120,
          style: "standard",
          words: [
            { text: "hello", startFrame: 60, endFrame: 90 },
            { text: "world", startFrame: 90, endFrame: 120 },
          ],
        },
      ],
      broll: [],
      motionGraphics: [
        {
          id: "mg-in",
          componentId: "metric_ticker",
          startFrame: 180,
          durationInFrames: 60,
          layerDepth: 35,
          props: { value: "42%" },
          triggerId: "stat-1",
        },
        {
          id: "mg-out",
          componentId: "metric_ticker",
          startFrame: 800,
          durationInFrames: 60,
          layerDepth: 35,
          props: { value: "99%" },
          triggerId: "stat-2",
        },
      ],
      transitions: [],
      vfx: [],
      sfx: [],
      multicam: [],
    },
    triggers: [
      {
        id: "stat-1",
        type: "stat_mention",
        transcriptStart: 6,
        transcriptEnd: 8,
        confidence: 0.9,
        status: "realized",
        resultingEntryId: "mg-in",
      },
      {
        id: "stat-2",
        type: "stat_mention",
        transcriptStart: 27,
        transcriptEnd: 29,
        confidence: 0.85,
        status: "realized",
        resultingEntryId: "mg-out",
      },
    ],
  };
}

describe("sliceTimeline", () => {
  it("remaps frames and drops truncated hard-content entries", () => {
    const parent = makeParentTimeline();
    const sliced = sliceTimeline({
      parentTimeline: parent,
      startFrame: 150,
      endFrame: 450,
      targetContentType: "social",
    });

    expect(sliced.durationInFrames).toBe(300);
    expect(sliced.tracks.video[0]?.startFrame).toBe(0);
    expect(sliced.tracks.video[0]?.durationInFrames).toBe(300);
    expect(sliced.tracks.motionGraphics).toHaveLength(1);
    expect(sliced.tracks.motionGraphics[0]?.id).toBe("mg-in");
    expect(sliced.tracks.motionGraphics[0]?.startFrame).toBe(30);
    expect(sliced.triggers).toHaveLength(1);
    expect(sliced.triggers[0]?.transcriptStart).toBe(1);
  });

  it("is deterministic for identical inputs", () => {
    const parent = makeParentTimeline();
    const opts = {
      parentTimeline: parent,
      startFrame: 150,
      endFrame: 450,
      targetContentType: "social" as const,
    };
    expect(sliceTimeline(opts)).toEqual(sliceTimeline(opts));
  });
});
