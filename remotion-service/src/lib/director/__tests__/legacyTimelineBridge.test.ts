import { describe, expect, it } from "vitest";
import { bridgeEditorTimelineToDirector } from "../legacyTimelineBridge";

describe("bridgeEditorTimelineToDirector", () => {
  it("maps video, motion graphics, music ducking, and vfx from editor timeline", () => {
    const timeline = bridgeEditorTimelineToDirector(
      {
        global_settings: { duration: 12 },
        metadata: { caption_style: { color: "#FFF" } },
        tracks: [
          {
            type: "video",
            clips: [
              {
                id: "v1",
                asset_id: "asset-main",
                timeline_start: 0,
                timeline_end: 12,
                source_start: 0,
                source_end: 12,
                speed: 1,
              },
            ],
          },
          {
            type: "music",
            clips: [
              {
                id: "m1",
                asset_id: "music-bed",
                timeline_start: 0,
                timeline_end: 12,
                volume: 0.3,
                effects: [{ type: "music_bed", params: { music_bed: true } }],
              },
            ],
          },
          {
            type: "captions",
            clips: [
              {
                id: "c1",
                timeline_start: 1,
                timeline_end: 3,
                label: "नमस्ते",
              },
            ],
          },
          {
            type: "overlay",
            clips: [
              {
                id: "mg1",
                timeline_start: 2,
                timeline_end: 5,
                effects: [
                  {
                    type: "visual_overlay",
                    params: {
                      visual_type: "lower_third_pro",
                      display_value: "Guest",
                      secondary_text: "Host",
                    },
                  },
                ],
              },
              {
                id: "vfx1",
                timeline_start: 4,
                timeline_end: 6,
                effects: [
                  {
                    type: "visual_overlay",
                    params: { visual_type: "glitch_overlay", intensity: 0.8 },
                  },
                ],
              },
            ],
          },
          {
            type: "effects",
            clips: [
              {
                id: "sfx1",
                timeline_start: 3,
                timeline_end: 3.5,
                effects: [
                  {
                    type: "sfx_slot",
                    params: { sfx_slug: "whoosh", sfx_volume: 0.4 },
                  },
                ],
              },
            ],
          },
        ],
      },
      { projectId: "proj-1", fps: 30, width: 1920, height: 1080 },
    );

    expect(timeline.projectId).toBe("proj-1");
    expect(timeline.tracks.video).toHaveLength(1);
    expect(timeline.tracks.video[0]?.assetId).toBe("asset-main");
    expect(timeline.tracks.motionGraphics).toHaveLength(2);
    expect(timeline.tracks.motionGraphics[0]?.componentId).toBe("lower_third_pro");
    expect(timeline.tracks.vfx).toHaveLength(0);
    expect(timeline.tracks.audio).toHaveLength(1);
    expect(timeline.tracks.audio[0]?.duckingWindows?.length).toBeGreaterThan(0);
    expect(timeline.tracks.sfx).toHaveLength(1);
    expect(timeline.tracks.sfx[0]?.soundId).toBe("whoosh");
  });
});
