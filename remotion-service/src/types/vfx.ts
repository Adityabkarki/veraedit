export type VFXOverlayType =
  | "glitch"
  | "scanline"
  | "chromatic_aberration"
  | "light_leak"
  | "halftone"
  | "doodle";

export interface VFXOverlayEntry {
  id: string;
  type: VFXOverlayType;
  startFrame: number;
  durationInFrames: number;
  layerDepth: number;
  intensity: number;
  triggerId: string;
}

export const VFX_LAYER_MIN = 70;
export const VFX_LAYER_MAX = 85;

export function vfxLayerDepth(type: VFXOverlayType): number {
  const depths: Record<VFXOverlayType, number> = {
    glitch: 78,
    scanline: 72,
    chromatic_aberration: 74,
    light_leak: 80,
    halftone: 76,
    doodle: 82,
  };
  return depths[type];
}

export function isValidVfxLayerDepth(depth: number): boolean {
  return depth >= VFX_LAYER_MIN && depth <= VFX_LAYER_MAX;
}
