export interface CameraFeedRef {
  id: string;
  label: string;
  sourceUrl: string;
  /** Resolved once at ingest via waveform cross-correlation. */
  syncOffsetFrames: number;
  /** Optional speaker id this feed primarily covers (e.g. "A", "B"). */
  speakerId?: string;
}

export type LayoutMode = "single" | "split_dual" | "grid";

export interface MulticamEntry {
  id: string;
  startFrame: number;
  endFrame: number;
  layoutMode: LayoutMode;
  activeFeedIds: string[];
  triggerId: string;
}
