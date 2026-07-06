import { describe, expect, it } from "vitest";
import { DEFAULT_THEME } from "@types/theme-tokens";
import type { DirectorSignals } from "@lib/director/signalTypes";
import { deleteTimelineEntry, promoteTrigger } from "@lib/director/overrides";
import { resolveTimeline, throttleTriggers } from "@lib/director/resolveTimeline";
import { timelineToMotionPlan } from "@lib/director/timelineToMotionPlan";

const baseSignals: DirectorSignals = {
  durationSeconds: 30,
  speakerChanges: [{ start: 0, end: 8, confidence: 0.75, speakerId: "A" }],
  topicShifts: [{ start: 0, end: 10, confidence: 0.8, topicLabel: "Intro" }],
  stats: [],
  comparisons: [],
  emphasisMoments: [{ start: 1, end: 3, confidence: 0.9, text: "Big moment" }],
  silences: [],
  sustainedSpeech: [{ start: 0, end: 8, confidence: 0.8 }],
  words: [],
  ctaPhrases: [],
  featureMentions: [],
  sceneSegments: [],
};

describe("resolveTimeline", () => {
  it("realizes podcast triggers with traceable TriggerLogEntry records", () => {
    const timeline = resolveTimeline({
      projectId: "proj-1",
      contentType: "podcast",
      fps: 30,
      durationSeconds: 30,
      width: 1920,
      height: 1080,
      theme: DEFAULT_THEME,
      signals: baseSignals,
      density: "balanced",
    });

    expect(timeline.tracks.motionGraphics.length).toBeGreaterThan(0);
    expect(timeline.tracks.transitions).toBeDefined();
    expect(timeline.tracks.video.length).toBeGreaterThan(0);
    expect(timeline.pacingProfile).toBe("relaxed");
    expect(timeline.theme.grade).toBeDefined();
    expect(timeline.theme.grade.warmth).toBeGreaterThan(0);
    expect(timeline.tracks.vfx).toHaveLength(0);
    expect(timeline.tracks.sfx).toBeDefined();
    expect(timeline.tracks.multicam).toBeDefined();
    expect(timeline.triggers.some((t) => t.status === "realized")).toBe(true);
    for (const entry of timeline.tracks.motionGraphics) {
      const trigger = timeline.triggers.find((t) => t.id === entry.triggerId);
      expect(trigger).toBeDefined();
      expect(trigger!.status).toBe("realized");
    }
  });

  it("suppresses excess triggers under minimalist density", () => {
    const manyStats: DirectorSignals = {
      ...baseSignals,
      stats: Array.from({ length: 6 }, (_, i) => ({
        start: i * 2,
        end: i * 2 + 1.5,
        confidence: 0.7 + i * 0.02,
        rawText: `${10 + i}%`,
        value: `${10 + i}%`,
        label: "Growth",
      })),
    };

    const throttled = throttleTriggers(
      manyStats.stats.map((s, i) => ({
        id: `stat-${i}`,
        type: "stat_mention",
        transcriptStart: s.start,
        transcriptEnd: s.end,
        confidence: s.confidence,
        componentId: "metric_ticker",
      })),
      "minimalist",
    );

    expect(throttled.realized.length).toBeLessThan(throttled.suppressed.length);
  });

  it("converts resolved timeline to MotionPlan", () => {
    const timeline = resolveTimeline({
      projectId: "proj-2",
      contentType: "consultancy",
      fps: 30,
      durationSeconds: 20,
      width: 1080,
      height: 1920,
      theme: DEFAULT_THEME,
      signals: {
        ...baseSignals,
        stats: [
          {
            start: 2,
            end: 5,
            confidence: 0.9,
            rawText: "40%",
            value: "40%",
            label: "Revenue",
          },
        ],
      },
    });

    const plan = timelineToMotionPlan(timeline);
    expect(plan.applyColorGrade).toBe(true);
    expect(plan.directorSource).toBe("director_timeline");
    expect(plan.elements.length).toBeGreaterThan(0);
    expect(plan.fps).toBe(30);
    expect(plan.theme).toBeDefined();
  });
});

describe("timeline overrides", () => {
  it("deletes entry and marks trigger suppressed", () => {
    const timeline = resolveTimeline({
      projectId: "proj-3",
      contentType: "podcast",
      fps: 30,
      durationSeconds: 15,
      width: 1920,
      height: 1080,
      theme: DEFAULT_THEME,
      signals: baseSignals,
    });
    const entry = timeline.tracks.motionGraphics[0]!;
    const next = deleteTimelineEntry(timeline, entry.id);
    expect(next.tracks.motionGraphics.find((e) => e.id === entry.id)).toBeUndefined();
    const trigger = next.triggers.find((t) => t.id === entry.triggerId);
    expect(trigger?.status).toBe("suppressed");
  });

  it("promotes a suppressed trigger", () => {
    let timeline = resolveTimeline({
      projectId: "proj-4",
      contentType: "social",
      fps: 30,
      durationSeconds: 10,
      width: 1080,
      height: 1920,
      theme: DEFAULT_THEME,
      signals: {
        ...baseSignals,
        words: [
          { index: 0, text: "Hello", start: 0, end: 0.4 },
          { index: 1, text: "world", start: 0.4, end: 0.8 },
        ],
        ctaPhrases: [{ start: 8, end: 9, confidence: 0.9, text: "Subscribe now" }],
      },
      density: "minimalist",
    });

    const suppressed = timeline.triggers.filter((t) => t.status === "suppressed");
    expect(suppressed.length).toBeGreaterThan(0);

    timeline = promoteTrigger(timeline, suppressed[0]!.id, "subscribe_badge");
    expect(timeline.tracks.motionGraphics.some((e) => e.triggerId === suppressed[0]!.id)).toBe(
      true,
    );
  });
});
