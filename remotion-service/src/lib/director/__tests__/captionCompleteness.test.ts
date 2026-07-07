/**
 * Phase 17 — caption completeness and throttle-starvation regressions.
 *
 * Guards the two flagship failure modes found in the honest audit:
 * 1. Social caption words being suppressed by the Density Throttle (92% loss).
 * 2. Caption candidates starving hooks/CTAs/titles out of density windows.
 * 3. Long-form pillars having an empty captions track.
 */
import { describe, expect, it } from "vitest";
import { resolveTimeline } from "../resolveTimeline";
import { groupWordsIntoPhrases, phrasesToCaptionCues } from "../captionCues";
import { DEFAULT_THEME } from "../../theme/defaultTheme";
import type { DirectorSignals } from "../signalTypes";

function fakeSignals(durationSeconds: number, wordsPerSecond = 2.5): DirectorSignals {
  const words = [];
  const n = Math.floor(durationSeconds * wordsPerSecond);
  for (let i = 0; i < n; i++) {
    const start = i / wordsPerSecond;
    words.push({ index: i, text: `word${i}`, start, end: start + 0.35 });
  }
  return {
    durationSeconds,
    words,
    speakerChanges: [
      { start: 20, end: 20.5, speakerId: "S2", confidence: 0.8, confidenceSource: "ml" },
    ],
    topicShifts: [
      { start: 15, end: 16, confidence: 0.75, topicLabel: "Pricing", confidenceSource: "heuristic" },
      { start: 40, end: 41, confidence: 0.7, topicLabel: "Growth", confidenceSource: "heuristic" },
    ],
    stats: [{ start: 25, end: 26.5, confidence: 0.85, value: "300%", text: "300% growth" }],
    comparisons: [],
    emphasisMoments: [
      { start: 1, end: 2.5, confidence: 0.9, text: "This changed everything", confidenceSource: "heuristic" },
      { start: 30, end: 31.5, confidence: 0.8, text: "Unbelievable", confidenceSource: "heuristic" },
    ],
    silences: [],
    sustainedSpeech: [],
    ctaPhrases: [{ start: 55, end: 56.5, confidence: 0.9, text: "subscribe" }],
    featureMentions: [],
    sceneSegments: [],
    shotClassifications: [],
  } as unknown as DirectorSignals;
}

function resolve(contentType: "social" | "podcast", durationSeconds = 60) {
  return resolveTimeline({
    projectId: "caption-test",
    contentType,
    fps: 30,
    durationSeconds,
    width: contentType === "social" ? 1080 : 1920,
    height: contentType === "social" ? 1920 : 1080,
    theme: DEFAULT_THEME,
    signals: fakeSignals(durationSeconds),
    density: "balanced",
  } as Parameters<typeof resolveTimeline>[0]);
}

describe("groupWordsIntoPhrases", () => {
  it("covers every word exactly once", () => {
    const signals = fakeSignals(60);
    const phrases = groupWordsIntoPhrases(signals.words);
    const total = phrases.reduce((acc, p) => acc + p.words.length, 0);
    expect(total).toBe(signals.words.length);
  });

  it("respects max words per phrase", () => {
    const phrases = groupWordsIntoPhrases(fakeSignals(60).words);
    for (const p of phrases) {
      expect(p.words.length).toBeLessThanOrEqual(5);
    }
  });

  it("is deterministic", () => {
    const words = fakeSignals(30).words;
    expect(groupWordsIntoPhrases(words)).toEqual(groupWordsIntoPhrases(words));
  });
});

describe("phrasesToCaptionCues", () => {
  it("produces frame-bounded cues with per-word frames", () => {
    const cues = phrasesToCaptionCues(groupWordsIntoPhrases(fakeSignals(10).words), 30);
    expect(cues.length).toBeGreaterThan(0);
    for (const cue of cues) {
      expect(cue.endFrame).toBeGreaterThan(cue.startFrame);
      expect(cue.words.length).toBeGreaterThan(0);
      for (const w of cue.words) {
        expect(w.endFrame).toBeGreaterThan(w.startFrame);
      }
    }
  });
});

describe("social caption throttle exemption", () => {
  it("realizes every caption phrase — none suppressed by density", () => {
    const t = resolve("social");
    const captionTriggers = t.triggers.filter((tr) => tr.type === "kinetic_caption");
    expect(captionTriggers.length).toBeGreaterThan(0);
    expect(captionTriggers.every((tr) => tr.status === "realized")).toBe(true);

    // Every transcript word appears in exactly one realized karaoke phrase.
    const karaoke = t.tracks.motionGraphics.filter(
      (e) => e.componentId === "kinetic_karaoke",
    );
    const wordCount = karaoke.reduce(
      (acc, e) => acc + ((e.props?.words as unknown[] | undefined)?.length ?? 0),
      0,
    );
    expect(wordCount).toBe(fakeSignals(60).words.length);
  });

  it("captions no longer starve other trigger types", () => {
    const t = resolve("social");
    const byComponent = new Set(t.tracks.motionGraphics.map((e) => e.componentId));
    expect(byComponent.has("kinetic_text")).toBe(true); // hook
    expect(byComponent.has("subscribe_badge")).toBe(true); // CTA
    expect(byComponent.has("animated_title")).toBe(true); // topic shift
  });

  it("keeps social captions off the captions track (karaoke graphics carry them)", () => {
    const t = resolve("social");
    expect(t.tracks.captions).toHaveLength(0);
  });
});

describe("long-form caption track", () => {
  it("podcast timelines carry caption cues end to end", () => {
    const t = resolve("podcast");
    expect(t.tracks.captions.length).toBeGreaterThan(0);

    const total = t.tracks.captions.reduce((acc, c) => acc + c.words.length, 0);
    expect(total).toBe(fakeSignals(60).words.length);

    // Cues span the spoken range — no dead caption stretches.
    const last = t.tracks.captions[t.tracks.captions.length - 1]!;
    expect(last.endFrame).toBeGreaterThan(55 * 30);
  });
});
