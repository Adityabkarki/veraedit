/**
 * 3D transform helpers — emulates av/remotion-bits perspective + rotateY patterns
 * using CSS matrix composition and Remotion interpolate (no external dep).
 */
import { interpolate } from "remotion";

export interface Card3DPose {
  perspective: number;
  rotateY: number;
  rotateX: number;
  rotateZ: number;
  scale: number;
  translateX: number;
  translateY: number;
  translateZ: number;
}

const DEFAULT_POSE: Card3DPose = {
  perspective: 1200,
  rotateY: 0,
  rotateX: 0,
  rotateZ: 0,
  scale: 1,
  translateX: 0,
  translateY: 0,
  translateZ: 0,
};

/** Build CSS transform string (remotion-bits style stacking). */
export function css3dTransform(pose: Partial<Card3DPose>): string {
  const p = { ...DEFAULT_POSE, ...pose };
  return [
    `perspective(${p.perspective}px)`,
    `translate3d(${p.translateX}px, ${p.translateY}px, ${p.translateZ}px)`,
    `rotateY(${p.rotateY}deg)`,
    `rotateX(${p.rotateX}deg)`,
    `rotateZ(${p.rotateZ}deg)`,
    `scale(${p.scale})`,
  ].join(" ");
}

/**
 * Interpolate a 3D card entrance (device mockup / product card).
 * progress: 0→1 from Remotion spring or interpolate.
 */
export function interpolateCard3D(
  progress: number,
  opts?: {
    fromRotateY?: number;
    toRotateY?: number;
    fromRotateX?: number;
    toRotateX?: number;
    fromScale?: number;
    float?: number;
    frame?: number;
  },
): string {
  const p = Math.max(0, Math.min(1.2, progress));
  const fromY = opts?.fromRotateY ?? -42;
  const toY = opts?.toRotateY ?? -12;
  const fromX = opts?.fromRotateX ?? 12;
  const toX = opts?.toRotateX ?? 3;
  const fromScale = opts?.fromScale ?? 0.72;
  const float =
    opts?.float !== undefined && opts?.frame !== undefined
      ? Math.sin(opts.frame * 0.06) * opts.float
      : 0;

  return css3dTransform({
    perspective: 1200,
    rotateY: interpolate(p, [0, 1], [fromY, toY], { extrapolateRight: "clamp" }),
    rotateX: interpolate(p, [0, 1], [fromX, toX], { extrapolateRight: "clamp" }),
    scale: interpolate(p, [0, 1], [fromScale, 1], { extrapolateRight: "clamp" }),
    translateY: float,
  });
}
