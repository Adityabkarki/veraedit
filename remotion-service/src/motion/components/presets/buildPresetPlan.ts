/**
 * Build a MotionPlan from an atomic preset definition.
 * Injects pillar nodes directly — never a raw generic video wrapper div.
 */

import type { MotionElement } from "../../types";
import { curveConfig, type AnimationCurveType } from "../physics";
import {
  ATOMIC_PRESET_DEFINITIONS,
  type AtomicPresetDefinition,
} from "./definitions";
import type {
  AtomicPresetId,
  BuildPresetPlanOptions,
  BuiltPresetPlan,
  PresetNodeTemplate,
} from "./types";

const FLASHY_TYPES = new Set([
  "particle_burst",
  "cta_badge",
  "shape_transition",
  "whip_transition",
  "glitch_overlay",
]);

function nodeToElement(
  node: PresetNodeTemplate,
  durationSeconds: number,
  forcedCurve: AnimationCurveType,
  brandColor: string,
  accentColor: string,
  propOverrides?: Record<string, Record<string, unknown>>,
): MotionElement {
  const start = Math.max(0, node.startRatio * durationSeconds);
  const end = Math.max(start + 0.3, node.endRatio * durationSeconds);
  const spring = curveConfig(forcedCurve);
  const overrides = propOverrides?.[node.id] ?? {};
  const props = {
    brandColor,
    accentColor,
    ...node.props,
    ...overrides,
    layerDepth: node.layerDepth,
  };

  return {
    id: node.id,
    type: node.type,
    startSeconds: start,
    endSeconds: end,
    position: { ...node.position },
    animation: {
      enter: node.animation?.enter ?? "fade",
      exit: node.animation?.exit ?? "fade",
      enterDuration: node.animation?.enterDuration ?? 0.4,
      exitDuration: node.animation?.exitDuration ?? 0.35,
      spring,
    },
    props,
  };
}

export function buildPresetPlan(
  presetId: AtomicPresetId,
  options: BuildPresetPlanOptions,
): BuiltPresetPlan {
  const def = ATOMIC_PRESET_DEFINITIONS[presetId];
  return buildPresetPlanFromDefinition(def, options);
}

export function buildPresetPlanFromDefinition(
  def: AtomicPresetDefinition,
  options: BuildPresetPlanOptions,
): BuiltPresetPlan {
  const durationSeconds = Math.max(3, options.durationSeconds);
  const brandColor = options.brandColor ?? "#3B82F6";
  const accentColor = options.accentColor ?? "#FFD600";
  const width = options.width ?? def.width;
  const height = options.height ?? def.height;
  const fps = options.fps ?? 30;

  const nodes = def.suppressFlashy
    ? def.nodes.filter((n) => !FLASHY_TYPES.has(n.type))
    : def.nodes;

  const elements = nodes.map((node) =>
    nodeToElement(
      node,
      durationSeconds,
      def.forcedCurve,
      brandColor,
      accentColor,
      options.propOverrides,
    ),
  );

  return {
    version: 1,
    fps,
    width,
    height,
    durationSeconds,
    preset: def.id,
    elements,
  };
}

/** Map legacy Magic Mode package ids to atomic preset ids. */
export function resolveAtomicPresetId(
  packageOrPreset: string,
): AtomicPresetId | null {
  const key = packageOrPreset.toLowerCase().replace(/-/g, "_");
  const map: Record<string, AtomicPresetId> = {
    podcast: "podcast",
    interview: "podcast",
    consultancy: "consultancy",
    pitch: "consultancy",
    minimal: "consultancy",
    social: "social",
    social_reel: "social",
    product: "product_showcase",
    product_showcase: "product_showcase",
    launch: "product_showcase",
    demo: "product_showcase",
  };
  return map[key] ?? (key in ATOMIC_PRESET_DEFINITIONS ? (key as AtomicPresetId) : null);
}
