/**
 * One-tap atomic preset configs — Step 4.
 * Each preset snaps multiple pillar atoms with forced physics + layout.
 */

import type { AnimationCurveType } from "../physics";
import type { MotionElement, MotionPlan } from "../../types";

export type AtomicPresetId =
  | "podcast"
  | "consultancy"
  | "social"
  | "product_showcase";

export interface PresetNodeTemplate {
  id: string;
  type: string;
  /** Start as fraction of clip duration (0–1). */
  startRatio: number;
  /** End as fraction of clip duration (0–1). */
  endRatio: number;
  position: { xPct: number; yPct: number };
  layerDepth: number;
  props?: Record<string, unknown>;
  animation?: {
    enter?: string;
    exit?: string;
    enterDuration?: number;
    exitDuration?: number;
  };
}

export interface AtomicPresetDefinition {
  id: AtomicPresetId;
  label: string;
  hint: string;
  /** Forced physics curve for every node in this preset. */
  forcedCurve: AnimationCurveType;
  /** Default canvas when preset is applied without explicit size. */
  width: number;
  height: number;
  /** Suppress flashy burst/pop types in consultancy mode. */
  suppressFlashy?: boolean;
  nodes: PresetNodeTemplate[];
}

export interface BuildPresetPlanOptions {
  durationSeconds: number;
  brandColor?: string;
  accentColor?: string;
  width?: number;
  height?: number;
  fps?: number;
  /** Override props on nodes by id. */
  propOverrides?: Record<string, Record<string, unknown>>;
}

export type BuiltPresetPlan = MotionPlan & { preset: AtomicPresetId };
