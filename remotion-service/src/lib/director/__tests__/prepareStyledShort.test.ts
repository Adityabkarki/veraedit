import { describe, expect, it } from "vitest";
import { DEFAULT_THEME } from "@types/theme-tokens";
import type { DirectorSignals } from "@lib/director/signalTypes";
import {
  filterSignalsToWindow,
  prepareStyledShortBase,
} from "../prepareStyledShort";

const fullSignals: DirectorSignals = {
  durationSeconds: 60,
  speakerChanges: [],
  topicShifts: [],
  stats: [{ start: 10, end: 12, confidence: 0.8, rawText: "50%" }],
  comparisons: [],
  emphasisMoments: [{ start: 55, end: 58, confidence: 0.7, text: "late" }],
  silences: [],
  sustainedSpeech: [],
  words: [
    { index: 0, text: "नमस्ते", start: 10, end: 10.5 },
    { index: 1, text: "संसार", start: 10.5, end: 11.0 },
  ],
  ctaPhrases: [],
  featureMentions: [],
  sceneSegments: [],
};

describe("prepareStyledShortBase", () => {
  it("filters signals to clip window for fallback compile", () => {
    const scoped = filterSignalsToWindow(fullSignals, 10, 20, 30);
    expect(scoped.durationSeconds).toBe(10);
    expect(scoped.words).toHaveLength(2);
    expect(scoped.words[0]?.start).toBe(0);
    expect(scoped.stats).toHaveLength(1);
    expect(scoped.emphasisMoments).toHaveLength(0);
  });

  it("fallback compile tags ML hook from viral scoring", () => {
    const timeline = prepareStyledShortBase({
      startFrame: 300,
      endFrame: 600,
      targetContentType: "social",
      projectId: "proj-fallback",
      fps: 30,
      width: 1080,
      height: 1920,
      theme: DEFAULT_THEME,
      signals: fullSignals,
      hookPhrase: {
        text: "Viral hook",
        confidence: 0.91,
        start: 10,
        end: 13,
        confidenceSource: "ml",
      },
      sourceAssetId: "asset-1",
    });

    expect(timeline.contentType).toBe("social");
    expect(timeline.pacingProfile).toBe("aggressive");
    expect(timeline.width).toBe(1080);
    expect(timeline.height).toBe(1920);
    expect(timeline.renderMetadata?.safeZoneMode).toBe("social_9_16");
    const hookTrigger = timeline.triggers.find((t) => t.type === "hook_phrase");
    expect(hookTrigger?.confidenceSource).toBe("ml");
  });
});
