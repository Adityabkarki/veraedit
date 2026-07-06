import { describe, expect, it } from "vitest";
import { FALLBACK_THEME } from "@lib/theme/fallbackTheme";
import { resolveDirectorRenderProps } from "../resolveDirectorRenderProps";
import { bridgeEditorTimelineToDirector } from "../legacyTimelineBridge";

describe("resolveDirectorRenderProps", () => {
  it("returns DirectorRender composition id and motion plan", () => {
    const timeline = bridgeEditorTimelineToDirector(
      {
        tracks: [
          {
            type: "video",
            clips: [
              {
                id: "v1",
                asset_id: "main",
                timeline_start: 0,
                timeline_end: 4,
              },
            ],
          },
          {
            type: "overlay",
            clips: [
              {
                id: "mg",
                timeline_start: 1,
                timeline_end: 3,
                effects: [
                  {
                    type: "visual_overlay",
                    params: { visual_type: "stat_counter", display_value: "42" },
                  },
                ],
              },
            ],
          },
        ],
      },
      { projectId: "p1", theme: FALLBACK_THEME },
    );

    const resolved = resolveDirectorRenderProps(timeline, {
      assetUrls: { main: "https://example.com/v.mp4" },
      primaryVideoSrc: "https://example.com/v.mp4",
    });

    expect(resolved.compositionId).toBe("DirectorRender");
    expect(resolved.motionPlan.elements.length).toBeGreaterThan(0);
    expect(resolved.inputProps.timeline.projectId).toBe("p1");
  });
});
