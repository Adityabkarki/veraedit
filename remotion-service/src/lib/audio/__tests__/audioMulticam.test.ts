import { describe, expect, it } from "vitest";
import {
  buildDuckingWindows,
  duckingVolumeAtFrame,
  mergeDuckingWindows,
} from "@lib/audio/resolveDucking";
import { proposeSfxFromTriggers, resolveSfxEntries } from "@lib/audio/resolveSfx";
import { resolveMulticamEntries } from "@lib/director/resolveMulticam";
import { applyAudioMulticamToTimeline } from "@lib/audio/applyAudioMulticam";
import { DEFAULT_THEME } from "@types/theme-tokens";
import type { DirectorTimeline } from "@types/timeline";

describe("resolveDucking", () => {
  it("merges overlapping windows to lowest target volume", () => {
    const merged = mergeDuckingWindows([
      {
        id: "a",
        trackId: "music",
        startFrame: 0,
        endFrame: 60,
        targetVolume: 0.3,
        attackFrames: 6,
        releaseFrames: 12,
      },
      {
        id: "b",
        trackId: "music",
        startFrame: 30,
        endFrame: 90,
        targetVolume: 0.2,
        attackFrames: 6,
        releaseFrames: 12,
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.targetVolume).toBe(0.2);
  });

  it("duckingVolumeAtFrame is deterministic pure function", () => {
    const windows = buildDuckingWindows("music", [
      { id: "d1", startFrame: 30, endFrame: 90 },
    ]);
    const a = duckingVolumeAtFrame(60, 1, windows);
    const b = duckingVolumeAtFrame(60, 1, windows);
    expect(a).toBe(b);
    expect(a).toBeLessThan(1);
  });
});

describe("resolveSfx", () => {
  it("consultancy only proposes click on stat triggers", () => {
    const proposals = proposeSfxFromTriggers(
      [
        {
          id: "stat-1",
          type: "stat_mention",
          transcriptStart: 2,
          transcriptEnd: 4,
          confidence: 0.9,
          status: "realized",
        },
        {
          id: "hook-1",
          type: "hook_phrase",
          transcriptStart: 0,
          transcriptEnd: 2,
          confidence: 0.9,
          status: "realized",
        },
      ],
      [],
      "consultancy",
      30,
    );
    expect(proposals).toHaveLength(1);
    // stat_mention draws deterministically from the click-family variant pool.
    expect(["shutter_click", "pop"]).toContain(proposals[0]!.soundId);
    expect(
      proposeSfxFromTriggers(
        [
          {
            id: "stat-1",
            type: "stat_mention",
            transcriptStart: 2,
            transcriptEnd: 4,
            confidence: 0.9,
            status: "realized",
          },
        ],
        [],
        "consultancy",
        30,
      )[0]!.soundId,
    ).toBe(proposals[0]!.soundId);
  });

  it("does not propose SFX for caption phrases (captions are content)", () => {
    const proposals = proposeSfxFromTriggers(
      Array.from({ length: 5 }, (_, i) => ({
        id: `k-${i}`,
        type: "kinetic_caption",
        transcriptStart: i * 2,
        transcriptEnd: i * 2 + 1,
        confidence: 0.7 + i * 0.05,
        status: "realized" as const,
      })),
      [],
      "social",
      30,
    );
    expect(proposals).toHaveLength(0);
  });

  it("throttles excess SFX under minimalist density", () => {
    const proposals = proposeSfxFromTriggers(
      Array.from({ length: 5 }, (_, i) => ({
        id: `e-${i}`,
        type: "high_emphasis_moment",
        transcriptStart: i * 2,
        transcriptEnd: i * 2 + 1,
        confidence: 0.7 + i * 0.05,
        status: "realized" as const,
      })),
      [],
      "social",
      30,
    );
    expect(proposals.length).toBeGreaterThan(0);
    const { sfx } = resolveSfxEntries(proposals, "minimalist");
    expect(sfx.length).toBeLessThan(proposals.length);
  });
});

describe("resolveMulticam", () => {
  const baseTimeline: DirectorTimeline = {
    schemaVersion: 1,
    projectId: "p",
    contentType: "podcast",
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
      sfx: [],
      multicam: [],
    },
    triggers: [],
  };

  it("no-ops when only one camera feed", () => {
    const entries = resolveMulticamEntries(
      baseTimeline,
      {
        durationSeconds: 10,
        speakerChanges: [{ start: 0, end: 5, confidence: 0.8, speakerId: "A" }],
        topicShifts: [],
        stats: [],
        comparisons: [],
        emphasisMoments: [],
        silences: [],
        sustainedSpeech: [],
        words: [],
        ctaPhrases: [],
        featureMentions: [],
        sceneSegments: [],
      },
      [{ id: "cam-a", label: "Host", sourceUrl: "/a.mp4", syncOffsetFrames: 0 }],
    );
    expect(entries).toHaveLength(0);
  });

  it("switches on speaker change with two feeds", () => {
    const entries = resolveMulticamEntries(
      baseTimeline,
      {
        durationSeconds: 10,
        speakerChanges: [
          { start: 0, end: 4, confidence: 0.8, speakerId: "A" },
          { start: 5, end: 9, confidence: 0.8, speakerId: "B" },
        ],
        topicShifts: [],
        stats: [],
        comparisons: [],
        emphasisMoments: [],
        silences: [],
        sustainedSpeech: [],
        words: [],
        ctaPhrases: [],
        featureMentions: [],
        sceneSegments: [],
      },
      [
        { id: "cam-a", label: "Host", sourceUrl: "/a.mp4", syncOffsetFrames: 0, speakerId: "A" },
        { id: "cam-b", label: "Guest", sourceUrl: "/b.mp4", syncOffsetFrames: 12, speakerId: "B" },
      ],
      "relaxed",
    );
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0]!.layoutMode).toBe("single");
  });
});

describe("applyAudioMulticamToTimeline", () => {
  it("attaches ducking windows when music bed present", () => {
    const timeline: DirectorTimeline = {
      schemaVersion: 1,
      projectId: "p",
      contentType: "podcast",
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
        sfx: [],
        multicam: [],
      },
      triggers: [],
    };

    const out = applyAudioMulticamToTimeline(timeline, {
      signals: {
        durationSeconds: 10,
        speakerChanges: [],
        topicShifts: [],
        stats: [],
        comparisons: [],
        emphasisMoments: [],
        silences: [],
        sustainedSpeech: [{ start: 1, end: 5, confidence: 0.8 }],
        words: [],
        ctaPhrases: [],
        featureMentions: [],
        sceneSegments: [],
      },
      musicBedAssetId: "music-1",
    });

    const music = out.tracks.audio.find((a) => a.id === "music-bed");
    expect(music?.duckingWindows?.length).toBeGreaterThan(0);
    expect(music?.duckUnderDialogue).toBe(true);
  });
});
