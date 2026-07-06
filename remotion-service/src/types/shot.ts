export type ShotType = "wide" | "medium" | "close_up" | "screen_recording" | "insert_broll";

export interface ShotClassification {
  startTime: number;
  endTime: number;
  shotType: ShotType;
  confidence: number;
  faceBoundingBoxRatio?: number;
}

/** Derive shot type from face-area ratio heuristic. */
export function shotTypeFromFaceRatio(ratio: number): ShotType {
  if (ratio < 0.08) return "wide";
  if (ratio < 0.22) return "medium";
  return "close_up";
}
