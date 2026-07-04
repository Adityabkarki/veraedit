/**
 * Declarative enter/exit animation (philosophy of stefanwittwer/remotion-animated).
 * Elements mount/unmount cleanly from MotionElement frame timings + family springs.
 */
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { MotionElement } from "./types";
import { elementLocalTime } from "./motionMath";
import { springConfigForElement } from "./motionBlueprints";

export type MountPreset =
  | "fade"
  | "slide-up"
  | "slide-left"
  | "slide-right"
  | "scale"
  | "pop"
  | "draw"
  | "none";

export interface ElementAnimState {
  active: boolean;
  local: number;
  duration: number;
  frame: number;
  fps: number;
  /** 0→1 enter spring */
  enter: number;
  /** 1→0 exit spring */
  exit: number;
  /** enter * exit */
  opacity: number;
}

/** Frame-accurate enter/exit springs for a motion element. */
export function useElementAnimation(el: MotionElement): ElementAnimState {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  const cfg = springConfigForElement(el);

  if (!active) {
    return { active: false, local, duration, frame, fps, enter: 0, exit: 0, opacity: 0 };
  }

  const enter = spring({
    frame: Math.max(0, Math.round(local * fps)),
    fps,
    config: cfg,
  });

  const exitDur = Math.max(0.05, el.animation.exitDuration);
  const exitStart = Math.max(0, duration - exitDur);
  let exit = 1;
  if (local >= exitStart) {
    const exitLocal = local - exitStart;
    const exitSpring = spring({
      frame: Math.max(0, Math.round(exitLocal * fps)),
      fps,
      config: { ...cfg, damping: Math.min(30, cfg.damping + 4) },
    });
    exit = 1 - Math.min(1, exitSpring);
  }

  return {
    active: true,
    local,
    duration,
    frame,
    fps,
    enter: Math.min(enter, 1.2),
    exit,
    opacity: Math.min(enter, 1) * exit,
  };
}

const CLAMP = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

function mountTransform(mount: MountPreset, enter: number, exit: number): string {
  const e = Math.min(enter, 1);
  const x = e * exit;
  switch (mount) {
    case "slide-up":
      return `translateY(${interpolate(x, [0, 1], [36, 0], CLAMP)}px)`;
    case "slide-left":
      return `translateX(${interpolate(x, [0, 1], [-80, 0], CLAMP)}px)`;
    case "slide-right":
      return `translateX(${interpolate(x, [0, 1], [80, 0], CLAMP)}px)`;
    case "scale":
      return `scale(${interpolate(x, [0, 1], [0.82, 1], CLAMP)})`;
    case "pop":
      return `scale(${interpolate(enter, [0, 0.7, 1], [0.4, 1.08, 1], CLAMP) * exit})`;
    case "draw":
      return `scaleX(${interpolate(x, [0, 1], [0.2, 1], CLAMP)})`;
    case "fade":
    case "none":
    default:
      return "";
  }
}

interface AnimatedProps {
  el: MotionElement;
  mount?: MountPreset;
  style?: React.CSSProperties;
  className?: string;
  children: React.ReactNode | ((anim: ElementAnimState) => React.ReactNode);
}

/**
 * Declarative wrapper: only renders while active; chains enter→hold→exit.
 * Usage mirrors remotion-animated's mount/unmount cleanliness.
 */
export const Animated: React.FC<AnimatedProps> = ({
  el,
  mount = "fade",
  style,
  className,
  children,
}) => {
  const anim = useElementAnimation(el);
  if (!anim.active) return null;

  const transform = mountTransform(mount, anim.enter, anim.exit);
  const content = typeof children === "function" ? children(anim) : children;

  return (
    <div
      className={className}
      style={{
        opacity: anim.opacity,
        transform: transform || undefined,
        transformOrigin: mount === "draw" ? "left center" : "center center",
        ...style,
      }}
    >
      {content}
    </div>
  );
};

/** Positioned + Animated (percent layout, clean mount/unmount). */
export const AnimatedAt: React.FC<
  AnimatedProps & { xPct?: number; yPct?: number }
> = ({ el, xPct, yPct, mount = "fade", style, children }) => {
  const anim = useElementAnimation(el);
  if (!anim.active) return null;

  const x = xPct ?? el.position.xPct;
  const y = yPct ?? el.position.yPct;
  const mountTx = mountTransform(mount, anim.enter, anim.exit);
  const content = typeof children === "function" ? children(anim) : children;

  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) ${mountTx}`.trim(),
        opacity: anim.opacity,
        maxWidth: "90%",
        transformOrigin: mount === "draw" ? "left center" : "center center",
        ...style,
      }}
    >
      {content}
    </div>
  );
};
