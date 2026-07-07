/** Shared easing / timing — keep in lockstep with apps/web/lib/motionMath.ts */

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeOutExpo(t: number): number {
  const x = clamp(t, 0, 1);
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

/** Slight overshoot — premium VOX entrances. */
export function easeOutBack(t: number): number {
  const x = clamp(t, 0, 1);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/**
 * Approximate Remotion spring for preview parity.
 * Defaults match damping ~14, stiffness ~180.
 */
export function springApprox(
  frame: number,
  fps: number,
  config?: { damping?: number; stiffness?: number; mass?: number },
): number {
  if (frame <= 0) return 0;
  const damping = config?.damping ?? 14;
  const stiffness = config?.stiffness ?? 180;
  const mass = Math.max(0.2, config?.mass ?? 1);
  const t = frame / fps;
  const omega = Math.sqrt(stiffness / mass);
  const decay = damping / (2 * Math.sqrt(mass * stiffness)) * omega;
  const underdamped = decay < omega;
  if (underdamped) {
    const wd = Math.sqrt(omega * omega - decay * decay);
    return clamp(1 - Math.exp(-decay * t) * Math.cos(wd * t), 0, 1.15);
  }
  return clamp(1 - Math.exp(-decay * t), 0, 1);
}

export function elementLocalTime(
  currentTime: number,
  startSeconds: number,
  endSeconds: number,
): { local: number; duration: number; active: boolean } {
  const duration = Math.max(0.001, endSeconds - startSeconds);
  const active = currentTime >= startSeconds && currentTime < endSeconds;
  const local = clamp(currentTime - startSeconds, 0, duration);
  return { local, duration, active };
}

/**
 * Re-base an element to Sequence-local time.
 *
 * Element renderers compare useCurrentFrame()/fps against startSeconds — but
 * inside a `<Sequence from={startFrame}>` the current frame is LOCAL (starts
 * at 0), while element bounds are absolute timeline seconds. Without this
 * shift, any element whose startSeconds exceeds its own duration never
 * activates in a real Director export (pillar previews mount at the
 * composition top level, which is why the bug never showed there).
 */
export function toSequenceLocalElement<
  T extends { startSeconds: number; endSeconds: number },
>(el: T): T {
  return {
    ...el,
    startSeconds: 0,
    endSeconds: Math.max(0.001, el.endSeconds - el.startSeconds),
  };
}

/** Stagger delay for the i-th item in a sequence. */
export function staggerDelay(index: number, count: number, totalDuration: number): number {
  if (count <= 1) return 0;
  return (index / count) * totalDuration * 0.85;
}

export function enterProgress(
  localTime: number,
  enterDuration: number,
  enterAnim: string,
): number {
  const t = clamp(localTime / Math.max(0.001, enterDuration), 0, 1);
  if (enterAnim === "fade" || enterAnim === "fade_up") return easeOutCubic(t);
  if (enterAnim.includes("slide") || enterAnim === "rise") return easeOutBack(t);
  if (enterAnim === "blur_in") return easeOutExpo(t);
  if (enterAnim === "scale_bounce" || enterAnim === "pop" || enterAnim === "pop_pulse") {
    return easeOutBack(t);
  }
  if (enterAnim === "count_up" || enterAnim === "fill" || enterAnim === "burst") {
    return easeInOutCubic(t);
  }
  if (enterAnim === "draw" || enterAnim === "grow" || enterAnim === "stroke_draw") {
    return easeOutExpo(t);
  }
  if (enterAnim === "drop" || enterAnim === "spring_in" || enterAnim === "reveal") {
    return easeOutBack(t);
  }
  if (enterAnim === "word_pop" || enterAnim === "rotate_in") return easeOutBack(t);
  if (enterAnim === "pulse_in") return easeOutBack(t);
  return easeOutCubic(t);
}

export function exitProgress(
  localTime: number,
  duration: number,
  exitDuration: number,
  exitAnim: string,
): number {
  const exitStart = Math.max(0, duration - exitDuration);
  if (localTime < exitStart) return 1;
  const t = clamp((localTime - exitStart) / Math.max(0.001, exitDuration), 0, 1);
  if (exitAnim === "scale_out") return 1 - easeOutBack(t);
  return 1 - easeOutCubic(t);
}

export function containsDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

export function pickFontFamily(text: string, defaultFamily: string): string {
  return containsDevanagari(text) ? "Noto Sans Devanagari" : defaultFamily;
}

/** Deterministic pseudo-random for particles (Remotion random compatible). */
export function seededRandom(seed: number, index: number): number {
  const x = Math.sin(seed * 9301 + index * 49297) * 49297;
  return x - Math.floor(x);
}
