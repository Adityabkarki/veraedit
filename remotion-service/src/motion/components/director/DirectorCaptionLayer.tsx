/**
 * Director caption layer — renders DirectorTimeline.tracks.captions cues.
 *
 * Long-form pillars (podcast / consultancy / showcase) get sentence-level
 * caption cues here; social captions render as kinetic_karaoke motion graphics
 * instead, so this layer receives an empty track for social and renders nothing.
 *
 * Laws honored:
 * - Devanagari Padding Law: content-box + 0.25em vertical padding, theme fonts.
 * - Title-Safe Zone Law: text stays inside the title-safe rect per aspect mode.
 * - Determinism Law: pure function of frame + props.
 * - Theme Token Law: all colors/fonts from the resolved ThemeToken.
 */
import React from "react";
import { Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { CaptionCueEntry } from "@types/timeline";
import { useTheme } from "../theme/ThemeProvider";
import { themeTypographyStyle } from "../theme/themeTypography";
import { withAlpha } from "@lib/theme/colorMath";
import { detectAspectMode, titleSafeRect } from "../safeZones";

export interface DirectorCaptionLayerProps {
  captions: CaptionCueEntry[];
}

const CaptionCue: React.FC<{ cue: CaptionCueEntry }> = ({ cue }) => {
  // Frame inside this Sequence is local; word frames are absolute timeline frames.
  const localFrame = useCurrentFrame();
  const frame = cue.startFrame + localFrame;
  const { width, height } = useVideoConfig();
  const theme = useTheme();

  const mode = detectAspectMode(width, height);
  const safe = titleSafeRect(mode);

  return (
    <div
      style={{
        position: "absolute",
        left: `${safe.left * 100}%`,
        right: `${safe.right * 100}%`,
        bottom: `${Math.max(safe.bottom, 0.08) * 100}%`,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: "88%",
          backgroundColor: withAlpha(theme.colors.background, 0.55),
          borderRadius: "0.35em",
          padding: "0.25em 0.7em",
          boxSizing: "content-box",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          columnGap: "0.28em",
        }}
      >
        {cue.words.map((w, i) => {
          const spoken = frame >= w.startFrame;
          const active = spoken && frame < w.endFrame;
          return (
            <span
              key={`${cue.id}-w${i}`}
              style={themeTypographyStyle(w.text, theme, {
                fontSize: Math.round(height * (mode === "social_9_16" ? 0.024 : 0.032)),
                fontWeight: 600,
                lineHeight: 1.35,
                paddingTop: "0.25em",
                paddingBottom: "0.25em",
                boxSizing: "content-box",
                color: active
                  ? theme.colors.accent
                  : spoken
                    ? theme.colors.onBackground
                    : withAlpha(theme.colors.onBackground, 0.82),
              })}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export const DirectorCaptionLayer: React.FC<DirectorCaptionLayerProps> = ({
  captions,
}) => {
  if (!captions?.length) return null;

  return (
    <>
      {captions.map((cue) => (
        <Sequence
          key={cue.id}
          from={cue.startFrame}
          durationInFrames={Math.max(1, cue.endFrame - cue.startFrame)}
          layout="none"
        >
          <CaptionCue cue={cue} />
        </Sequence>
      ))}
    </>
  );
};
