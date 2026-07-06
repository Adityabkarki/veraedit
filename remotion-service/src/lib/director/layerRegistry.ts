import { COMPONENT_LAYER_DEPTH, DEFAULT_LAYER_DEPTH, LAYER_BANDS } from "./constants";

export function layerDepthForComponent(componentId: string): number {
  return COMPONENT_LAYER_DEPTH[componentId] ?? DEFAULT_LAYER_DEPTH;
}

export function layerBandForDepth(depth: number): keyof typeof LAYER_BANDS {
  if (depth <= LAYER_BANDS.background.max) return "background";
  if (depth <= LAYER_BANDS.content.max) return "content";
  if (depth <= LAYER_BANDS.overlay.max) return "overlay";
  if (depth <= LAYER_BANDS.vfx.max) return "vfx";
  return "chrome";
}

/** True when two entries overlap in time and share the same layer band. */
export function layerConflict(
  aStart: number,
  aEnd: number,
  aDepth: number,
  bStart: number,
  bEnd: number,
  bDepth: number,
): boolean {
  const overlap = aStart < bEnd && bStart < aEnd;
  if (!overlap) return false;
  return layerBandForDepth(aDepth) === layerBandForDepth(bDepth);
}
