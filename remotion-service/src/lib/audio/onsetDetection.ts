/**
 * Deterministic onset detection via spectral-flux peak picking.
 * Computed once upstream — no mutable state across frames.
 */

export interface OnsetDetectOptions {
  /** Minimum relative flux to count as onset (0–1 vs track peak flux). */
  threshold?: number;
  /** Minimum gap between onsets in frames. */
  minGapFrames?: number;
}

/**
 * Peak-pick positive amplitude deltas (spectral flux proxy).
 * Returns a boolean array aligned to input amplitudes.
 */
export function detectTransients(
  amplitudes: number[],
  options: OnsetDetectOptions = {},
): boolean[] {
  const threshold = options.threshold ?? 0.2;
  const minGapFrames = options.minGapFrames ?? 3;
  const n = amplitudes.length;
  const flags = new Array<boolean>(n).fill(false);
  if (n < 2) return flags;

  const flux: number[] = [0];
  for (let i = 1; i < n; i++) {
    flux.push(Math.max(0, (amplitudes[i] ?? 0) - (amplitudes[i - 1] ?? 0)));
  }

  const peakFlux = Math.max(...flux, 0.0001);
  const cutoff = threshold * peakFlux;
  let lastOnset = -minGapFrames;

  for (let i = 1; i < n; i++) {
    const isPeak =
      flux[i] >= cutoff &&
      flux[i] >= (flux[i - 1] ?? 0) &&
      flux[i] >= (flux[i + 1] ?? 0);
    if (isPeak && i - lastOnset >= minGapFrames) {
      flags[i] = true;
      lastOnset = i;
    }
  }

  return flags;
}

export function applyTransientsToFrames<T extends { isTransient: boolean }>(
  frames: T[],
  amplitudes: number[],
  options?: OnsetDetectOptions,
): T[] {
  const transients = detectTransients(amplitudes, options);
  return frames.map((f, i) => ({
    ...f,
    isTransient: transients[i] ?? false,
  }));
}
