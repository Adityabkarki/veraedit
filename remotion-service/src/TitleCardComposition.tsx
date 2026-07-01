import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface TitleCardProps {
  text: string;
  startSeconds: number;
  endSeconds: number;
  fontFamily: string;
  brandColor: string;
}

export const TitleCardComposition: React.FC<TitleCardProps> = ({
  text,
  startSeconds,
  endSeconds,
  fontFamily,
  brandColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  if (currentTime < startSeconds || currentTime > endSeconds) return null;

  const localFrame = frame - Math.round(startSeconds * fps);
  const enter = spring({ frame: localFrame, fps, config: { damping: 14 } });
  const translateY = interpolate(enter, [0, 1], [40, 0]);
  const opacity = interpolate(enter, [0, 1], [0, 1]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-start",
        alignItems: "center",
        paddingTop: "12%",
        backgroundColor: "transparent",
      }}
    >
      <div
        style={{
          fontFamily,
          fontSize: 64,
          fontWeight: 800,
          color: "#fff",
          background: `${brandColor}cc`,
          padding: "16px 32px",
          borderRadius: 16,
          transform: `translateY(${translateY}px)`,
          opacity,
          textAlign: "center",
          maxWidth: "85%",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
