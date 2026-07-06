/**
 * Camera motion wrapper — applies percentage-based scale/pan (Layout Isolation Law).
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { CameraMotionSchema } from "@types/camera-motion";
import { cameraMotionAtFrame } from "@types/camera-motion";

export interface CameraMotionWrapperProps {
  motion: CameraMotionSchema;
  durationInFrames: number;
  children: React.ReactNode;
}

export const CameraMotionWrapper: React.FC<CameraMotionWrapperProps> = ({
  motion,
  durationInFrames,
  children,
}) => {
  const frame = useCurrentFrame();
  const { scale, position } = cameraMotionAtFrame(motion, frame, durationInFrames);

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${scale})`,
        transformOrigin: `${position.x}% ${position.y}%`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
