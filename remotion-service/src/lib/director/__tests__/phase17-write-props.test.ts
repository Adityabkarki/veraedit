import { it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { DEFAULT_THEME } from "../../theme/defaultTheme";

it("writes isolation render props", () => {
  const timeline = {
    schemaVersion: 1,
    projectId: "phase17-isolation",
    contentType: "podcast",
    fps: 30,
    durationInFrames: 300,
    width: 1920,
    height: 1080,
    theme: DEFAULT_THEME,
    tracks: {
      video: [],
      audio: [],
      captions: [
        {
          id: "cue-1",
          startFrame: 30,
          endFrame: 105,
          style: "standard",
          words: [
            { text: "नमस्ते", startFrame: 30, endFrame: 48 },
            { text: "साथीहरू", startFrame: 48, endFrame: 66 },
            { text: "स्वागत", startFrame: 66, endFrame: 84 },
            { text: "छ", startFrame: 84, endFrame: 105 },
          ],
        },
        {
          id: "cue-2",
          startFrame: 110,
          endFrame: 180,
          style: "standard",
          words: [
            { text: "this", startFrame: 110, endFrame: 128 },
            { text: "is", startFrame: 128, endFrame: 140 },
            { text: "a", startFrame: 140, endFrame: 150 },
            { text: "caption", startFrame: 150, endFrame: 180 },
          ],
        },
      ],
      broll: [],
      motionGraphics: [
        {
          id: "mg-karaoke",
          componentId: "kinetic_karaoke",
          startFrame: 190,
          durationInFrames: 80,
          layerDepth: 65,
          props: {
            text: "काठमाडौंमा ठूलो अवसर",
            words: [
              { text: "काठमाडौंमा", startSeconds: 0.1 },
              { text: "ठूलो", startSeconds: 0.6 },
              { text: "अवसर", startSeconds: 1.1 },
            ],
          },
          triggerId: "t-k",
        },
      ],
      transitions: [
        { id: "tr-1", type: "whip_pan", atFrame: 45, durationInFrames: 14, direction: "left", easing: "linear" },
        { id: "tr-2", type: "glitch_cut", atFrame: 150, durationInFrames: 8, easing: "linear" },
      ],
      vfx: [],
      sfx: [],
      multicam: [],
    },
    triggers: [],
  };
  mkdirSync("render-check", { recursive: true });
  writeFileSync(
    "render-check/phase17-props.json",
    JSON.stringify({ timeline, assetUrls: {} }, null, 1),
    "utf-8",
  );
});
