/**
 * Symmetric Entry/Exit Law — skills.md.
 * Frame-rate independence: durations in seconds, converted via fps.
 * Determinism: pure function of frame + props (via Remotion hooks).
 */

import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import {
  curveConfig,
  type AnimationCurveType,
  type PhysicsCurve,
} from "./physics";

export interface AtomicAnimInput {
  /** Element start in seconds. */
  startSeconds: number;
  /** Element end in seconds. */
  endSeconds: number;
  /** Enter duration in seconds. */
  enterDurationSeconds?: number;
  /** Exit duration in seconds. */
  exitDurationSeconds?: number;
  enterCurve: AnimationCurveType;
  /** Defaults to enterCurve when omitted. */
  exitCurve?: AnimationCurveType;
}

export interface AtomicAnimState {
  active: boolean;
  frame: number;
  fps: number;
  width: number;
  height: number;
  /** Local time in seconds since start. */
  localSeconds: number;
  durationSeconds: number;
  /** 0→1 enter spring. */
  enter: number;
  /** 1→0 exit spring. */
  exit: number;
  opacity: number;
}

function runSpring(
  localSeconds: number,
  fps: number,
  cfg: PhysicsCurve,
): number {
  return spring({
    frame: Math.max(0, Math.round(localSeconds * fps)),
    fps,
    config: cfg,
  });
}

export function useAtomicAnimation(input: AtomicAnimInput): AtomicAnimState {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const durationSeconds = Math.max(0.001, input.endSeconds - input.startSeconds);
  const active = t >= input.startSeconds && t < input.endSeconds;
  const localSeconds = active
    ? Math.min(durationSeconds, Math.max(0, t - input.startSeconds))
    : 0;

  if (!active) {
    return {
      active: false,
      frame,
      fps,
      width,
      height,
      localSeconds: 0,
      durationSeconds,
      enter: 0,
      exit: 0,
      opacity: 0,
    };
  }

  const enterCfg = curveConfig(input.enterCurve);
  const exitCfg = curveConfig(input.exitCurve ?? input.enterCurve);
  const enterDur = Math.max(0.05, input.enterDurationSeconds ?? 0.4);
  const exitDur = Math.max(0.05, input.exitDurationSeconds ?? 0.35);

  const enter = Math.min(1.2, runSpring(localSeconds, fps, enterCfg));

  const exitStart = Math.max(0, durationSeconds - exitDur);
  let exit = 1;
  if (localSeconds >= exitStart) {
    const exitLocal = localSeconds - exitStart;
    const exitSpring = runSpring(exitLocal, fps, exitCfg);
    exit = 1 - Math.min(1, exitSpring);
  }

  // Gate enter by enter duration so very short clips still animate out cleanly
  const enterGate = Math.min(1, localSeconds / enterDur + 0.001);

  return {
    active: true,
    frame,
    fps,
    width,
    height,
    localSeconds,
    durationSeconds,
    enter,
    exit,
    opacity: Math.min(enter, 1) * enterGate * exit,
  };
}
