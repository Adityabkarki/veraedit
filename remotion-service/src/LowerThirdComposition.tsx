import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface LowerThirdProps {
  text: string;
  subtext?: string;
  startSeconds: number;
  endSeconds: number;
  fontFamily: string;
  brandColor: string;
  animation?: "slide_up" | "fade_in";
}

export const LowerThirdComposition: React.FC<LowerThirdProps> = ({
  text,
  subtext,
  startSeconds,
  endSeconds,
  fontFamily,
  brandColor,
  animation = "slide_up",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  if (currentTime < startSeconds || currentTime > endSeconds) return null;

  const localFrame = frame - Math.round(startSeconds * fps);
  const exitFrame = Math.round((endSeconds - startSeconds) * fps) - Math.round(0.3 * fps);

  const enterProgress = spring({
    frame: localFrame,
    fps,
    config: { damping: 15, stiffness: 180 },
  });
  const exitProgress = spring({
    frame: Math.max(0, localFrame - exitFrame),
    fps,
    config: { damping: 20, stiffness: 300 },
  });

  const translateY =
    animation === "slide_up"
      ? interpolate(enterProgress, [0, 1], [30, 0]) -
        interpolate(exitProgress, [0, 1], [0, 30])
      : 0;
  const opacity =
    interpolate(enterProgress, [0, 1], [0, 1]) *
    interpolate(exitProgress, [0, 1], [1, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: 60,
          transform: `translateY(${translateY}px)`,
          opacity,
        }}
      >
        <div
          style={{
            background: brandColor,
            height: 4,
            width: 40,
            marginBottom: 8,
            borderRadius: 2,
          }}
        />
        <p
          style={{
            fontFamily,
            fontSize: 44,
            fontWeight: 700,
            color: "white",
            textShadow: "0 2px 8px rgba(0,0,0,0.6)",
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          {text}
        </p>
        {subtext ? (
          <p
            style={{
              fontFamily,
              fontSize: 28,
              fontWeight: 400,
              color: "rgba(255,255,255,0.8)",
              marginTop: 4,
              marginBottom: 0,
            }}
          >
            {subtext}
          </p>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
