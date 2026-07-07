import { describe, expect, it } from "vitest";
import { DEFAULT_THEME } from "@types/theme-tokens";
import type { DirectorTimeline } from "@types/timeline";
import type { DirectorSignals } from "@lib/director/signalTypes";
import { reskinTimeline } from "../reskinTimeline";

function consultancyTimeline(): DirectorTimeline {
  return {
    schemaVersion: 1,
    projectId: "proj-reskin",
    contentType: "consultancy",
    fps: 30,
    durationInFrames: 300,
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
          durationInFrames: 300,
          sourceStartSeconds: 0,
          sourceEndSeconds: 10,
          speed: 1,
        },
      ],
      audio: [],
      captions: [
        {
          id: "cap-1",
          startFrame: 0,
          endFrame: 60,
          style: "standard",
          words: [{ text: "test", startFrame: 0, endFrame: 30 }],
        },
      ],
      broll: [],
      motionGraphics: [
        {
          id: "mg-stat",
          componentId: "metric_ticker",
          startFrame: 30,
          durationInFrames: 60,
          layerDepth: 35,
          props: { value: "42%" },
          triggerId: "stat-1",
        },
      ],
      transitions: [],
      vfx: [],
      sfx: [],
      multicam: [],
    },
    triggers: [],
  };
}

const socialSignals: DirectorSignals = {
  durationSeconds: 10,
  speakerChanges: [],
  topicShifts: [],
  stats: [{ start: 1, end: 3, confidence: 0.9, rawText: "42%" }],
  comparisons: [],
  emphasisMoments: [{ start: 0, end: 2, confidence: 0.95, text: "Hook", confidenceSource: "ml" }],
  silences: [{ start: 8, end: 9, confidence: 0.8 }],
  sustainedSpeech: [{ start: 0, end: 8, confidence: 0.8 }],
  words: [
    { index: 0, text: "hello", start: 0, end: 0.5 },
    { index: 1, text: "world", start: 0.5, end: 1.0 },
  ],
  ctaPhrases: [],
  featureMentions: [],
  sceneSegments: [],
  audioFrames: [{ frame: 15, isTransient: true }],
};

describe("reskinTimeline", () => {
  it("replaces pacing, grade, captions, and transitions for Social pillar", () => {
    const reskinned = reskinTimeline({
      timeline: consultancyTimeline(),
      targetContentType: "social",
      signals: socialSignals,
      sourceAssetId: "asset-1",
      audioFrames: [{ frame: 15, isTransient: true }],
    });

    expect(reskinned.contentType).toBe("social");
    expect(reskinned.pacingProfile).toBe("aggressive");
    expect(reskinned.theme.grade.saturation).toBeGreaterThan(
      consultancyTimeline().theme.grade.saturation,
    );
    expect(reskinned.tracks.captions.every((c) => c.style === "karaoke")).toBe(true);
    expect(reskinned.tracks.transitions.length).toBeGreaterThan(0);
    expect(reskinned.tracks.motionGraphics.some((m) => m.id === "mg-stat")).toBe(true);
  });

  it("returns unchanged timeline when target matches parent pillar", () => {
    const timeline = consultancyTimeline();
    expect(
      reskinTimeline({
        timeline,
        targetContentType: "consultancy",
        signals: socialSignals,
      }),
    ).toEqual(timeline);
  });
});
