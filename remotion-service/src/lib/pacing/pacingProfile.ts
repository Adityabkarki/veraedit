export type PacingProfileName = "relaxed" | "balanced" | "aggressive";

export interface PacingProfile {
  profile: PacingProfileName;
  /** Pauses longer than this (ms) become cut points. */
  silenceTrimThresholdMs: number;
  /** Floor so aggressive pacing never produces single-frame flashes. */
  minClipDurationFrames: number;
  defaultTransitionDurationFrames: number;
  /** Caps push-in / ken-burns scale delta. */
  maxCameraMotionIntensity: number;
  /** When true, speed up filler segments instead of cutting them. */
  speedRampOnFiller: boolean;
}

export const PACING_PRESETS: Record<PacingProfileName, PacingProfile> = {
  relaxed: {
    profile: "relaxed",
    silenceTrimThresholdMs: 1200,
    minClipDurationFrames: 60,
    defaultTransitionDurationFrames: 20,
    maxCameraMotionIntensity: 0.05,
    speedRampOnFiller: false,
  },
  balanced: {
    profile: "balanced",
    silenceTrimThresholdMs: 700,
    minClipDurationFrames: 30,
    defaultTransitionDurationFrames: 12,
    maxCameraMotionIntensity: 0.08,
    speedRampOnFiller: false,
  },
  aggressive: {
    profile: "aggressive",
    silenceTrimThresholdMs: 350,
    minClipDurationFrames: 12,
    defaultTransitionDurationFrames: 6,
    maxCameraMotionIntensity: 0.12,
    speedRampOnFiller: true,
  },
};

/** Default pacing profile per content pillar. */
export const DEFAULT_PACING_BY_CONTENT: Record<
  "podcast" | "consultancy" | "social" | "showcase",
  PacingProfileName
> = {
  podcast: "relaxed",
  consultancy: "balanced",
  social: "aggressive",
  showcase: "balanced",
};

export function getPacingProfile(name?: PacingProfileName): PacingProfile {
  return PACING_PRESETS[name ?? "balanced"];
}
