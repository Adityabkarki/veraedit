import { describe, expect, it } from "vitest";
import { DEFAULT_THEME } from "@types/theme-tokens";
import type { DirectorTimeline } from "@types/timeline";
import {
  PLATFORM_RENDER_VARIANTS,
  applyPlatformVariantToTimeline,
  platformToRenderVariant,
} from "../platformRenderVariant";

function socialTimeline(): DirectorTimeline {
  return {
    schemaVersion: 1,
    projectId: "proj-platform",
    contentType: "social",
    fps: 30,
    durationInFrames: 300,
    width: 1080,
    height: 1920,
    theme: DEFAULT_THEME,
    tracks: {
      video: [],
      audio: [],
      captions: [
        {
          id: "c1",
          startFrame: 0,
          endFrame: 60,
          style: "karaoke",
          words: [{ text: "hi", startFrame: 0, endFrame: 30 }],
        },
      ],
      broll: [],
      motionGraphics: [
        {
          id: "cta",
          componentId: "subscribe_badge",
          startFrame: 240,
          durationInFrames: 60,
          layerDepth: 90,
          props: {},
          triggerId: "cta-1",
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

describe("platformRenderVariant", () => {
  it("maps API platform strings to variants", () => {
    expect(platformToRenderVariant("youtube_shorts").platform).toBe("youtube");
    expect(platformToRenderVariant("instagram_reels").platform).toBe("instagram");
    expect(platformToRenderVariant("linkedin").showCtaBadge).toBe(false);
  });

  it("applies LinkedIn reduced captions without re-compilation", () => {
    const timeline = socialTimeline();
    const linkedin = applyPlatformVariantToTimeline(
      timeline,
      PLATFORM_RENDER_VARIANTS.linkedin,
    );
    const tiktok = applyPlatformVariantToTimeline(
      timeline,
      PLATFORM_RENDER_VARIANTS.tiktok,
    );

    expect(linkedin.tracks.captions[0]?.style).toBe("standard");
    expect(tiktok.tracks.captions[0]?.style).toBe("karaoke");
    expect(linkedin.tracks.motionGraphics).toHaveLength(0);
    expect(tiktok.tracks.motionGraphics).toHaveLength(1);
  });
});
