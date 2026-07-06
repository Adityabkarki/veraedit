import type { DuckingWindow, SfxEntry } from "@types/timeline";

export interface DuckingSource {
  startFrame: number;
  endFrame: number;
  id: string;
}

const DEFAULT_ATTACK = 6;
const DEFAULT_RELEASE = 12;
const PRE_ROLL = 4;
const POST_ROLL = 8;
const DUCK_TARGET = 0.3;

/** Build ducking windows for dialogue and SFX against a music bed track. */
export function buildDuckingWindows(
  trackId: string,
  sources: DuckingSource[],
  options: {
    targetVolume?: number;
    attackFrames?: number;
    releaseFrames?: number;
  } = {},
): DuckingWindow[] {
  const {
    targetVolume = DUCK_TARGET,
    attackFrames = DEFAULT_ATTACK,
    releaseFrames = DEFAULT_RELEASE,
  } = options;
  const raw: DuckingWindow[] = sources.map((src) => ({
    id: `duck-${src.id}`,
    trackId,
    startFrame: Math.max(0, src.startFrame - PRE_ROLL),
    endFrame: src.endFrame + POST_ROLL,
    targetVolume,
    attackFrames,
    releaseFrames,
  }));
  return mergeDuckingWindows(raw);
}

/** Merge overlapping windows — use lowest targetVolume (avoid stacking to silence). */
export function mergeDuckingWindows(windows: DuckingWindow[]): DuckingWindow[] {
  if (!windows.length) return [];
  const sorted = [...windows].sort((a, b) => a.startFrame - b.startFrame);
  const merged: DuckingWindow[] = [{ ...sorted[0]! }];

  for (const win of sorted.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (win.startFrame <= last.endFrame) {
      last.endFrame = Math.max(last.endFrame, win.endFrame);
      last.targetVolume = Math.min(last.targetVolume, win.targetVolume);
    } else {
      merged.push({ ...win });
    }
  }
  return merged;
}

/** Pure frame function — Deterministic Ducking Law. */
export function duckingVolumeAtFrame(
  frame: number,
  baseVolume: number,
  windows: DuckingWindow[],
): number {
  let vol = baseVolume;
  for (const w of windows) {
    if (frame < w.startFrame - w.attackFrames || frame > w.endFrame + w.releaseFrames) {
      continue;
    }
    let target = w.targetVolume * baseVolume;
    if (frame < w.startFrame) {
      const t = (frame - (w.startFrame - w.attackFrames)) / w.attackFrames;
      target = baseVolume + (target - baseVolume) * clamp01(t);
    } else if (frame > w.endFrame) {
      const t = (frame - w.endFrame) / w.releaseFrames;
      target = target + (baseVolume - target) * clamp01(t);
    } else {
      target = w.targetVolume * baseVolume;
    }
    vol = Math.min(vol, target);
  }
  return clamp01(vol);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function duckingSourcesFromDialogue(
  segments: { start: number; end: number }[],
  fps: number,
): DuckingSource[] {
  return segments.map((seg, i) => ({
    id: `dialogue-${i}`,
    startFrame: Math.round(seg.start * fps),
    endFrame: Math.round(seg.end * fps),
  }));
}

export function duckingSourcesFromSfx(sfx: SfxEntry[], fps: number): DuckingSource[] {
  return sfx.map((s) => ({
    id: s.id,
    startFrame: s.startFrame,
    endFrame: s.startFrame + Math.round(0.35 * fps),
  }));
}
