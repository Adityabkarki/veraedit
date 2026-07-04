export interface SpringConfig {
  damping: number;
  stiffness: number;
  mass: number;
}

export interface MotionElement {
  id: string;
  type: string;
  startSeconds: number;
  endSeconds: number;
  position: { xPct: number; yPct: number };
  animation: {
    enter: string;
    exit: string;
    enterDuration: number;
    exitDuration: number;
    spring?: SpringConfig;
  };
  props: Record<string, unknown>;
}

export interface MotionPlan {
  version: number;
  fps: number;
  width: number;
  height: number;
  durationSeconds?: number;
  elements: MotionElement[];
  /** Resolved theme from Brand Kit — attached upstream before render. */
  theme?: import("../../types/theme-tokens").ThemeToken;
}

export interface MotionGraphicsProps {
  plan: MotionPlan;
  fontFamily: string;
  /** Resolved ThemeToken from layout JSON — migrated before render. */
  theme?: import("../../types/theme-tokens").ThemeToken;
}
