/**
 * Font loading — @remotion/google-fonts guarantees faces are registered
 * before frame/layout calculation (critical for Devanagari width metrics).
 */
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadNotoDevanagari } from "@remotion/google-fonts/NotoSansDevanagari";

const montserrat = loadMontserrat("normal", {
  weights: ["600", "700", "800", "900"],
  subsets: ["latin"],
});

const notoDevanagari = loadNotoDevanagari("normal", {
  weights: ["600", "700", "800"],
  subsets: ["devanagari"],
});

/** Latin display / kinetic titles */
export const FONT_DISPLAY = montserrat.fontFamily;

/** Corporate / consultancy body (same family, lighter optical weight via CSS) */
export const FONT_CORPORATE = montserrat.fontFamily;

/** Nepali / Devanagari — must load before text-width measurement */
export const FONT_DEVANAGARI = notoDevanagari.fontFamily;

export function resolveMotionFont(text: string, fallback?: string): string {
  if (/[\u0900-\u097F]/.test(text)) return FONT_DEVANAGARI;
  return fallback || FONT_DISPLAY;
}
