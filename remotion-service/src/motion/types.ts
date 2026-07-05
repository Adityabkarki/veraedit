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

export interface MotionPlanAudio {
  /** Presigned HTTP URL for Path A client decode. */
  src?: string;
  durationSeconds?: number;
  bandCount?: number;
  sourceHash?: string;
  fps?: number;
  analysisPath?: "client_visualizeAudio" | "server_librosa";
  /** Remote sidecar URL (Path B fetch at mount). */
  sidecarUrl?: string;
  /** Inline precomputed track (Path B embed from backend). */
  track?: unknown;
  /** Legacy alias for inline track. */
  sidecar?: unknown;
  error?: string;
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
  /** Audio-reactive analysis routing — Path A or Path B. */
  audio?: MotionPlanAudio;
}

export interface MotionGraphicsProps {
  plan: MotionPlan;
  fontFamily: string;
  /** Resolved ThemeToken from layout JSON — migrated before render. */
  theme?: import("../../types/theme-tokens").ThemeToken;
}
