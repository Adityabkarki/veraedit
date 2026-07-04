/** WCAG relative luminance for sRGB hex colors. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function parseHex(hex: string): { r: number; g: number; b: number } {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function isLight(hex: string): boolean {
  return relativeLuminance(hex) > 0.5;
}

const NEAR_WHITE = "#F8FAFC";
const NEAR_BLACK = "#0F172A";

/** Pick contrast-safe text on a background; tweak bg if neither black nor white passes. */
export function contrastSafeText(
  background: string,
  minRatio = 4.5,
): { text: string; adjustedBackground?: string } {
  const whiteRatio = contrastRatio(NEAR_WHITE, background);
  const blackRatio = contrastRatio(NEAR_BLACK, background);

  if (whiteRatio >= minRatio) return { text: NEAR_WHITE };
  if (blackRatio >= minRatio) return { text: NEAR_BLACK };

  const bg = parseHex(background);
  const lighten = whiteRatio > blackRatio;
  for (let step = 1; step <= 12; step++) {
    const factor = lighten ? 1 + step * 0.06 : 1 - step * 0.06;
    const adjusted = toHex(bg.r * factor, bg.g * factor, bg.b * factor);
    const candidate = lighten ? NEAR_BLACK : NEAR_WHITE;
    if (contrastRatio(candidate, adjusted) >= minRatio) {
      return { text: candidate, adjustedBackground: adjusted };
    }
  }
  return { text: lighten ? NEAR_BLACK : NEAR_WHITE };
}

export function hexToRgb(hex: string): [number, number, number] {
  const { r, g, b } = parseHex(hex);
  return [r, g, b];
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Perceptual distance in HSL space (hue-weighted). */
export function perceptualDistance(a: string, b: string): number {
  const [h1, s1, l1] = rgbToHsl(...hexToRgb(a));
  const [h2, s2, l2] = rgbToHsl(...hexToRgb(b));
  const dh = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2)) / 180;
  const ds = s1 - s2;
  const dl = l1 - l2;
  return Math.sqrt(dh * dh * 4 + ds * ds + dl * dl);
}

const MIN_ACCENT_DISTANCE = 0.28;

/** Shift accent along hue wheel until it clears background. */
export function accentSafeForBackground(accent: string, background: string): string {
  let current = accent;
  if (perceptualDistance(current, background) >= MIN_ACCENT_DISTANCE) return current;
  const [, s, l] = rgbToHsl(...hexToRgb(accent));
  for (let deg = 30; deg <= 330; deg += 30) {
    const candidate = hslToHex(deg, Math.max(s, 0.55), Math.max(0.45, Math.min(l, 0.65)));
    if (perceptualDistance(candidate, background) >= MIN_ACCENT_DISTANCE) {
      return candidate;
    }
  }
  return hslToHex(45, 0.9, 0.55);
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
