/**
 * Physics Constant Manifest — skills.md.
 * Every animated element must use one of these three named curves.
 */

export type AnimationCurveType =
  | "snappy_spring"
  | "elegant_glide"
  | "elastic_overshoot";

export interface PhysicsCurve {
  mass: number;
  stiffness: number;
  damping: number;
}

export const PHYSICS_CURVES: Record<AnimationCurveType, PhysicsCurve> = {
  snappy_spring: { mass: 0.4, stiffness: 180, damping: 12 },
  elegant_glide: { mass: 1.0, stiffness: 90, damping: 24 },
  elastic_overshoot: { mass: 0.7, stiffness: 140, damping: 8 },
};

/** Preset → forced curve (Step 4). */
export const PRESET_CURVE: Record<
  "podcast" | "consultancy" | "social" | "product_showcase",
  AnimationCurveType
> = {
  podcast: "elegant_glide",
  consultancy: "elegant_glide",
  social: "snappy_spring",
  product_showcase: "elastic_overshoot",
};

export function curveConfig(curve: AnimationCurveType): PhysicsCurve {
  return { ...PHYSICS_CURVES[curve] };
}
