/**
 * Interpolation Clamping Law — skills.md.
 * Every interpolate() must clamp unless intentional elastic_overshoot.
 */

import { interpolate } from "remotion";

const CLAMP = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

export function lerpClamp(
  input: number,
  inputRange: readonly number[],
  outputRange: readonly number[],
): number {
  return interpolate(input, inputRange as number[], outputRange as number[], CLAMP);
}

/** Allow overshoot only for intentional elastic effects. */
export function lerpOvershoot(
  input: number,
  inputRange: readonly number[],
  outputRange: readonly number[],
): number {
  return interpolate(input, inputRange as number[], outputRange as number[], {
    extrapolateLeft: "extend",
    extrapolateRight: "extend",
  });
}
