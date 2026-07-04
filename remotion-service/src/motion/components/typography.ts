/**
 * Devanagari Padding Law — skills.md.
 * py-[0.25em] minimum, content-box, fonts loaded before text-width math.
 */

import type { CSSProperties } from "react";
import { containsDevanagari } from "../motionMath";
import { resolveMotionFont } from "../fonts";

const MIN_PAD_EM = 0.25;

export function typographyWrapperStyle(
  text: string,
  fontFamily: string,
  extras: CSSProperties = {},
): CSSProperties {
  const dev = containsDevanagari(text);
  return {
    fontFamily: resolveMotionFont(text, fontFamily),
    boxSizing: "content-box",
    lineHeight: dev ? 1.55 : 1.25,
    paddingTop: `${MIN_PAD_EM}em`,
    paddingBottom: `${MIN_PAD_EM}em`,
    overflow: "visible",
    ...extras,
  };
}
