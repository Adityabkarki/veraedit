/**
 * Shared easing / timing for motion graphics preview.
 * Keep in lockstep with remotion-service/src/motion/motionMath.ts
 */

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function easeOutCubic(t: number): number {
  const x = clamp(t, 0, 1)
  return 1 - Math.pow(1 - x, 3)
}

export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

export function springApprox(frame: number, fps: number): number {
  if (frame <= 0) return 0
  const t = frame / fps
  const omega = 12
  const decay = 8
  return clamp(1 - Math.exp(-decay * t) * Math.cos(omega * t), 0, 1)
}

export function elementLocalTime(
  currentTime: number,
  startSeconds: number,
  endSeconds: number,
): { local: number; duration: number; active: boolean } {
  const duration = Math.max(0.001, endSeconds - startSeconds)
  const active = currentTime >= startSeconds && currentTime < endSeconds
  const local = clamp(currentTime - startSeconds, 0, duration)
  return { local, duration, active }
}

export function enterProgress(
  localTime: number,
  enterDuration: number,
  enterAnim: string,
): number {
  const t = clamp(localTime / Math.max(0.001, enterDuration), 0, 1)
  if (enterAnim === 'fade' || enterAnim === 'fade_up') return easeOutCubic(t)
  if (enterAnim.includes('slide') || enterAnim === 'rise') return easeOutCubic(t)
  if (enterAnim === 'blur_in') return easeOutCubic(t)
  if (enterAnim === 'scale_bounce' || enterAnim === 'pop' || enterAnim === 'pop_pulse') {
    return t < 1 ? 0.85 + 0.15 * Math.sin(t * Math.PI) : 1
  }
  if (enterAnim === 'count_up' || enterAnim === 'fill' || enterAnim === 'burst') {
    return easeInOutCubic(t)
  }
  if (enterAnim === 'draw') return easeOutCubic(t)
  if (enterAnim === 'word_pop' || enterAnim === 'rotate_in') return easeOutCubic(t)
  return easeOutCubic(t)
}

export function exitProgress(
  localTime: number,
  duration: number,
  exitDuration: number,
  _exitAnim: string,
): number {
  const exitStart = Math.max(0, duration - exitDuration)
  if (localTime < exitStart) return 1
  const t = clamp((localTime - exitStart) / Math.max(0.001, exitDuration), 0, 1)
  return 1 - easeOutCubic(t)
}

export function containsDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text)
}

export function seededRandom(seed: number, index: number): number {
  const x = Math.sin(seed * 9301 + index * 49297) * 49297
  return x - Math.floor(x)
}
