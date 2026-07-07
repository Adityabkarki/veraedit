import type { ThemeToken } from "./theme-tokens";
import type { CameraMotionSchema } from "./camera-motion";
import type { TransitionEntry } from "./transitions";
import type { VFXOverlayEntry } from "./vfx";
import type { MulticamEntry } from "./multicam";

export type { VFXOverlayEntry, VFXOverlayType } from "./vfx";
export { VFX_LAYER_MIN, VFX_LAYER_MAX, vfxLayerDepth, isValidVfxLayerDepth } from "./vfx";
export type { CameraFeedRef, LayoutMode, MulticamEntry } from "./multicam";

export type PacingProfileName = "relaxed" | "balanced" | "aggressive";

export const DIRECTOR_TIMELINE_SCHEMA_VERSION = 1;

export type DirectorContentType = "podcast" | "consultancy" | "social" | "showcase";

export type GraphicsDensity = "minimalist" | "balanced" | "immersive";

export type TriggerStatus = "realized" | "suppressed";

export type BRollSource = "pexels" | "ai_generated" | "user_upload";

export type CaptionStyle = "standard" | "karaoke" | "pull_quote";

export interface CaptionWord {
  text: string;
  startFrame: number;
  endFrame: number;
}

export interface CaptionCueEntry {
  id: string;
  startFrame: number;
  endFrame: number;
  words: CaptionWord[];
  style: CaptionStyle;
}

export interface VideoClipEntry {
  id: string;
  assetId: string;
  startFrame: number;
  durationInFrames: number;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  speed: number;
  label?: string;
  cameraMotion?: CameraMotionSchema;
  playbackRate?: number;
}

export interface AudioClipEntry {
  id: string;
  assetId: string;
  startFrame: number;
  durationInFrames: number;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  volume: number;
  duckUnderDialogue?: boolean;
  label?: string;
  duckingWindows?: DuckingWindow[];
}

export interface SfxEntry {
  id: string;
  soundId: string;
  startFrame: number;
  triggerId: string;
  volume: number;
}

export interface DuckingWindow {
  id: string;
  trackId: string;
  startFrame: number;
  endFrame: number;
  targetVolume: number;
  attackFrames: number;
  releaseFrames: number;
}

export interface MotionGraphicsEntry {
  id: string;
  componentId: string;
  startFrame: number;
  durationInFrames: number;
  layerDepth: number;
  props: Record<string, unknown>;
  triggerId: string;
}

export interface BRollEntry {
  id: string;
  startFrame: number;
  durationInFrames: number;
  source: BRollSource;
  assetUrl: string;
  searchQuery?: string;
  triggerId: string;
}

export interface TriggerLogEntry {
  id: string;
  type: string;
  transcriptStart: number;
  transcriptEnd: number;
  confidence: number;
  status: TriggerStatus;
  resultingEntryId?: string;
  metadata?: Record<string, unknown>;
  confidenceSource?: "heuristic" | "ml";
}

/** Proposed trigger before density throttling — output of Director rule sets. */
export interface TriggerCandidate {
  id: string;
  type: string;
  transcriptStart: number;
  transcriptEnd: number;
  confidence: number;
  componentId: string;
  props?: Record<string, unknown>;
  brollQuery?: string;
  metadata?: Record<string, unknown>;
}

export interface DirectorTimeline {
  schemaVersion: number;
  projectId: string;
  contentType: DirectorContentType;
  fps: number;
  durationInFrames: number;
  width: number;
  height: number;
  theme: ThemeToken;
  audioAnalysisRef?: string;
  pacingProfile?: PacingProfileName;
  tracks: {
    video: VideoClipEntry[];
    audio: AudioClipEntry[];
    captions: CaptionCueEntry[];
    broll: BRollEntry[];
    motionGraphics: MotionGraphicsEntry[];
    transitions: TransitionEntry[];
    vfx: VFXOverlayEntry[];
    sfx: SfxEntry[];
    multicam: MulticamEntry[];
  };
  triggers: TriggerLogEntry[];
  /** Render-time metadata (reframe, safe zones) — not used during compile. */
  renderMetadata?: {
    safeZoneMode?: "social_9_16" | "broadcast_16_9";
    reframeWarning?: string | null;
    panX?: number;
    verticalReframed?: boolean;
  };
}

export interface DirectorTimelineInput {
  projectId: string;
  contentType: DirectorContentType;
  fps: number;
  durationSeconds: number;
  width: number;
  height: number;
  theme: ThemeToken;
  audioAnalysisRef?: string;
  density?: GraphicsDensity;
  pacing?: PacingProfileName;
  sourceAssetId?: string;
  audioFrames?: { frame: number; isTransient: boolean }[];
  fillerSegments?: { start: number; end: number }[];
  cameraFeeds?: import("./multicam").CameraFeedRef[];
  musicBedAssetId?: string;
}
