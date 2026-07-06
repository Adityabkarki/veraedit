import { describe, expect, it } from "vitest";
import { GRADE_PRESETS, gradeForContentType } from "@lib/look/gradePresets";
import {
  buildColorMatrix,
  buildWarmthMatrix,
  grainOpacity,
} from "@lib/look/gradeMatrix";
import { buildNoiseTile, seededNoiseValue } from "@lib/look/seededNoise";
import { applyGradeToTheme, resolveVfxOverlays } from "@lib/look/resolveLook";
import { DEFAULT_THEME } from "@types/theme-tokens";
import {
  countFlashesPerSecond,
  vfxOverlayStateAtFrame,
} from "../../../motion/components/vfx/overlays/vfxOverlayMath";
import { GLITCH_MAX_FRAMES } from "@types/transitions";

describe("gradePresets", () => {
  it("all four content types have distinct presets", () => {
    const podcast = GRADE_PRESETS.podcast;
    const social = GRADE_PRESETS.social;
    expect(social.contrast).toBeGreaterThan(podcast.contrast);
    expect(GRADE_PRESETS.consultancy.grainIntensity).toBe(0);
  });

  it("buildColorMatrix is deterministic", () => {
    const a = buildColorMatrix(GRADE_PRESETS.social);
    const b = buildColorMatrix(GRADE_PRESETS.social);
    expect(a).toBe(b);
    expect(a.split(" ").length).toBe(20);
  });

  it("warmth matrix shifts red/blue channels", () => {
    const warm = buildWarmthMatrix(0.5);
    const cool = buildWarmthMatrix(-0.5);
    expect(warm).not.toBe(cool);
  });
});

describe("seededNoise", () => {
  it("same seed produces same noise values", () => {
    expect(seededNoiseValue("clip-1", 3, 4)).toBe(seededNoiseValue("clip-1", 3, 4));
    expect(seededNoiseValue("clip-1", 3, 4)).not.toBe(seededNoiseValue("clip-2", 3, 4));
  });

  it("noise tile is pre-generated not random per call", () => {
    const tile = buildNoiseTile("test", 8, 8);
    expect(tile.length).toBe(8);
    expect(tile[0]!.length).toBe(8);
  });
});

describe("applyGradeToTheme", () => {
  it("always applies content-type grade", () => {
    const themed = applyGradeToTheme(DEFAULT_THEME, "podcast");
    expect(themed.grade).toEqual(gradeForContentType("podcast"));
  });

  it("consultancy grade is deliberately neutral but explicit", () => {
    const themed = applyGradeToTheme(DEFAULT_THEME, "consultancy");
    expect(themed.grade.grainIntensity).toBe(0);
    expect(themed.grade.contrast).toBeGreaterThan(0);
  });
});

describe("vfx overlay flash safety", () => {
  it("glitch overlay is capped and produces at most one flash burst", () => {
    const fps = 30;
    const durationInFrames = 4;
    let rises = 0;
    let prevHigh = false;
    for (let f = 0; f < durationInFrames; f++) {
      const state = vfxOverlayStateAtFrame(f, durationInFrames, "glitch", 0.8);
      const high = state.opacity > 0.5;
      if (high && !prevHigh) rises++;
      prevHigh = high;
    }
    expect(durationInFrames).toBeLessThanOrEqual(GLITCH_MAX_FRAMES);
    expect(rises).toBeLessThanOrEqual(1);
    const flashesPerSec = countFlashesPerSecond(fps, durationInFrames, "glitch", 0.8);
    expect(flashesPerSec * (durationInFrames / fps)).toBeLessThanOrEqual(3);
  });

  it("glitch overlay state is deterministic", () => {
    const a = vfxOverlayStateAtFrame(2, 4, "glitch", 0.7);
    const b = vfxOverlayStateAtFrame(2, 4, "glitch", 0.7);
    expect(a).toEqual(b);
  });
});

describe("resolveVfxOverlays content-type defaults", () => {
  const baseTimeline = {
    schemaVersion: 1,
    projectId: "p",
    contentType: "consultancy" as const,
    fps: 30,
    durationInFrames: 300,
    width: 1920,
    height: 1080,
    theme: DEFAULT_THEME,
    tracks: {
      video: [],
      audio: [],
      captions: [],
      broll: [],
      motionGraphics: [],
      transitions: [],
      vfx: [],
    },
    triggers: [],
  };

  it("consultancy produces no auto VFX", () => {
    const { vfx } = resolveVfxOverlays(
      baseTimeline,
      {
        durationSeconds: 10,
        speakerChanges: [],
        topicShifts: [],
        stats: [{ start: 1, end: 2, confidence: 0.9, rawText: "40%" }],
        comparisons: [],
        emphasisMoments: [{ start: 0, end: 2, confidence: 0.9, text: "Hook" }],
        silences: [],
        sustainedSpeech: [],
        words: [],
        ctaPhrases: [],
        featureMentions: [],
        sceneSegments: [],
        audioFrames: [{ frame: 10, isTransient: true }],
      },
      "immersive",
    );
    expect(vfx).toHaveLength(0);
  });

  it("social proposes VFX on hooks and beats", () => {
    const { vfx } = resolveVfxOverlays(
      { ...baseTimeline, contentType: "social" },
      {
        durationSeconds: 10,
        speakerChanges: [],
        topicShifts: [],
        stats: [],
        comparisons: [],
        emphasisMoments: [{ start: 1, end: 2.5, confidence: 0.9, text: "Big hook" }],
        silences: [],
        sustainedSpeech: [],
        words: [],
        ctaPhrases: [],
        featureMentions: [],
        sceneSegments: [],
        audioFrames: [{ frame: 15, isTransient: true }],
      },
      "balanced",
    );
    expect(vfx.length).toBeGreaterThan(0);
    expect(vfx.every((e) => e.layerDepth >= 70 && e.layerDepth <= 85)).toBe(true);
  });
});
