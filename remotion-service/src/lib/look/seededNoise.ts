/** Deterministic seeded noise — never Math.random() per frame. */
export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededNoiseValue(seed: string, x: number, y: number): number {
  const h = hashSeed(`${seed}:${x}:${y}`);
  return (h % 1000) / 1000;
}

/** Pre-generate a fixed noise tile for grain cycling. */
export function buildNoiseTile(
  seed: string,
  width: number,
  height: number,
): number[][] {
  const rows: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      row.push(seededNoiseValue(seed, x, y));
    }
    rows.push(row);
  }
  return rows;
}

export const NOISE_FRAME_COUNT = 8;

export function noiseFrameIndex(frame: number): number {
  return frame % NOISE_FRAME_COUNT;
}
