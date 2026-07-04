import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { MotionGraphicsProps } from "./types";
import { renderMotionElement } from "./elements";

export const MotionGraphicsComposition: React.FC<MotionGraphicsProps> = ({
  plan,
  fontFamily,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;
  const elements = plan?.elements ?? [];

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      {elements.map((el) => {
        if (currentTime < el.startSeconds || currentTime > el.endSeconds) {
          if (el.type !== "background_gradient") return null;
        }
        return renderMotionElement(el, fontFamily);
      })}
    </AbsoluteFill>
  );
};
