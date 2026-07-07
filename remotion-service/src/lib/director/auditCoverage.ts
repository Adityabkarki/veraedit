/**
 * Phase 16 — trigger type → component coverage audit.
 * Enumerates Director trigger types and reports built / partial / missing status.
 */

import { ATOMIC_RENDERERS } from "../../motion/components/adapters";
import { TRIGGER_COMPONENT_MAP } from "./constants";

/** Legacy motion elements registered in elements.tsx (not yet atomic adapters). */
export const LEGACY_BUILT_COMPONENTS = new Set([
  "broadcast_lower_third",
  "chapter_marker",
  "quote_callout",
  "comparison_chart",
  "timeline_flow",
  "focus_frame",
  "kinetic_text",
  "animated_title",
  "subscribe_badge",
  "bar_chart",
  "line_chart",
  "lower_third_pro",
  "name_plate",
]);

export type ComponentBuildStatus = "built" | "partial" | "missing";

export interface TriggerCoverageRow {
  triggerType: string;
  idealComponentIds: string[];
  status: ComponentBuildStatus;
  notes: string;
}

export interface CoverageGapReport {
  generatedAt: string;
  atomicCount: number;
  legacyCount: number;
  rows: TriggerCoverageRow[];
  missing: string[];
  partial: string[];
  built: string[];
}

function componentStatus(componentId: string): ComponentBuildStatus {
  if (componentId in ATOMIC_RENDERERS) return "built";
  if (LEGACY_BUILT_COMPONENTS.has(componentId)) return "partial";
  return "missing";
}

function worstStatus(statuses: ComponentBuildStatus[]): ComponentBuildStatus {
  if (statuses.includes("missing")) return "missing";
  if (statuses.includes("partial")) return "partial";
  return "built";
}

/** All trigger types referenced across pillar maps and rule sets. */
export function enumerateTriggerTypes(): string[] {
  return [...new Set(Object.keys(TRIGGER_COMPONENT_MAP))].sort();
}

/** Ideal component IDs per trigger type (all pillars). */
export function idealComponentsForTrigger(triggerType: string): string[] {
  const map = TRIGGER_COMPONENT_MAP[triggerType];
  if (!map) return [];
  return [...new Set(Object.values(map).filter(Boolean) as string[])];
}

/** Phase 16 completeness components — always treated as built when present in ATOMIC_RENDERERS. */
export const COMPLETENESS_COMPONENTS = [
  "topic_title_card",
  "icon_point_callout",
  "bullet_list_reveal",
  "comparison_table",
  "pull_quote_card",
] as const;

export function auditTriggerCoverage(): CoverageGapReport {
  const rows: TriggerCoverageRow[] = enumerateTriggerTypes().map((triggerType) => {
    const idealComponentIds = idealComponentsForTrigger(triggerType);
    const statuses = idealComponentIds.map(componentStatus);
    const status = idealComponentIds.length ? worstStatus(statuses) : "missing";
    const notes =
      status === "built"
        ? "Atomic or legacy renderer available for all ideal components"
        : status === "partial"
          ? "Legacy elements.tsx renderer only — not ThemeProvider atomic"
          : "No renderer registered — fallback chain required";

    return { triggerType, idealComponentIds, status, notes };
  });

  return {
    generatedAt: new Date().toISOString(),
    atomicCount: Object.keys(ATOMIC_RENDERERS).length,
    legacyCount: LEGACY_BUILT_COMPONENTS.size,
    rows,
    missing: rows.filter((r) => r.status === "missing").map((r) => r.triggerType),
    partial: rows.filter((r) => r.status === "partial").map((r) => r.triggerType),
    built: rows.filter((r) => r.status === "built").map((r) => r.triggerType),
  };
}

export function isComponentBuilt(componentId: string): boolean {
  return componentStatus(componentId) !== "missing";
}
