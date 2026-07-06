export type CameraMotionType = "ken_burns" | "push_in" | "drift" | "whip_zoom";

export type PhysicsCurve = "elegant_glide" | "snappy_spring" | "elastic_overshoot";

export interface CameraMotionSchema {
  type: CameraMotionType;
  startScale: number;
  endScale: number;
  /** Percentage-based anchor (Layout Isolation Law). */
  startPosition: { x: number; y: number };
  endPosition: { x: number; y: number };
  curve: PhysicsCurve;
  /** Derived from clip id — deterministic direction/intensity. */
  seed: string;
}

export interface CameraMotionFrame {
  scale: number;
  position: { x: number; y: number };
}

const CURVE_WEIGHT: Record<PhysicsCurve, number> = {
  elegant_glide: 0.85,
  snappy_spring: 1.1,
  elastic_overshoot: 1.25,
};

/** FNV-1a hash — deterministic seed from clip id string. */
export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic unit value in [0, 1) from seed + salt. */
export function seededUnit(seed: string, salt: string): number {
  const h = hashSeed(`${seed}:${salt}`);
  return (h % 10000) / 10000;
}

/** Eased progress for camera motion along clip duration. */
export function cameraMotionProgress(
  localFrame: number,
  durationInFrames: number,
  curve: PhysicsCurve,
): number {
  if (durationInFrames <= 0) return 0;
  const t = Math.max(0, Math.min(1, localFrame / durationInFrames));
  const w = CURVE_WEIGHT[curve];
  if (curve === "elastic_overshoot") {
    return t + Math.sin(t * Math.PI) * 0.08 * w;
  }
  if (curve === "snappy_spring") {
    return t * t * (3 - 2 * t) * w * 0.9 + t * 0.1;
  }
  // elegant_glide
  return t * t * (3 - 2 * t);
}

/** Pure function: camera state at a given local frame (Motion Continuity Law). */
export function cameraMotionAtFrame(
  schema: CameraMotionSchema,
  localFrame: number,
  durationInFrames: number,
): CameraMotionFrame {
  const p = cameraMotionProgress(localFrame, durationInFrames, schema.curve);
  return {
    scale: schema.startScale + (schema.endScale - schema.startScale) * p,
    position: {
      x: schema.startPosition.x + (schema.endPosition.x - schema.startPosition.x) * p,
      y: schema.startPosition.y + (schema.endPosition.y - schema.startPosition.y) * p,
    },
  };
}

/** Build deterministic Ken Burns schema from clip id and intensity cap. */
export function buildKenBurnsMotion(
  clipId: string,
  maxIntensity: number,
): CameraMotionSchema {
  const dx = (seededUnit(clipId, "kb-x") - 0.5) * maxIntensity * 200;
  const dy = (seededUnit(clipId, "kb-y") - 0.5) * maxIntensity * 200;
  const scaleDelta = 0.04 + seededUnit(clipId, "kb-s") * maxIntensity;
  return {
    type: "ken_burns",
    startScale: 1,
    endScale: 1 + scaleDelta,
    startPosition: { x: 50 - dx * 0.5, y: 50 - dy * 0.5 },
    endPosition: { x: 50 + dx * 0.5, y: 50 + dy * 0.5 },
    curve: "elegant_glide",
    seed: clipId,
  };
}

/** Subtle push-in for talking-head segments. */
export function buildPushInMotion(clipId: string, maxIntensity: number): CameraMotionSchema {
  const delta = Math.min(maxIntensity, 0.08);
  return {
    type: "push_in",
    startScale: 1,
    endScale: 1 + delta,
    startPosition: { x: 50, y: 50 },
    endPosition: { x: 50, y: 50 },
    curve: "elegant_glide",
    seed: clipId,
  };
}

/** Idle drift for static consultancy slides. */
export function buildDriftMotion(clipId: string, maxIntensity: number): CameraMotionSchema {
  const dx = (seededUnit(clipId, "dr-x") - 0.5) * maxIntensity * 80;
  return {
    type: "drift",
    startScale: 1,
    endScale: 1,
    startPosition: { x: 50 - dx, y: 50 },
    endPosition: { x: 50 + dx, y: 50 },
    curve: "elegant_glide",
    seed: clipId,
  };
}

/** Rapid whip zoom — pairs with whip_pan / zoom_blur_cut transitions. */
export function buildWhipZoomMotion(clipId: string, maxIntensity: number): CameraMotionSchema {
  const spike = 1 + Math.min(maxIntensity * 1.5, 0.18);
  return {
    type: "whip_zoom",
    startScale: 1,
    endScale: spike,
    startPosition: { x: 50, y: 50 },
    endPosition: { x: 50, y: 50 },
    curve: "elastic_overshoot",
    seed: clipId,
  };
}
