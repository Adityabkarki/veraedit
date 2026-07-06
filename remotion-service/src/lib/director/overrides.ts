import type { DirectorTimeline, TriggerLogEntry } from "@types/timeline";
import { layerDepthForComponent } from "./layerRegistry";

/** Remove a realized entry and mark its trigger suppressed (Phase 6). */
export function deleteTimelineEntry(
  timeline: DirectorTimeline,
  entryId: string,
): DirectorTimeline {
  const next = structuredClone(timeline);
  next.tracks.motionGraphics = next.tracks.motionGraphics.filter((e) => e.id !== entryId);
  next.tracks.broll = next.tracks.broll.filter((e) => e.id !== entryId);

  next.triggers = next.triggers.map((t) => {
    if (t.resultingEntryId !== entryId) return t;
    return { ...t, status: "suppressed" as const, resultingEntryId: undefined };
  });

  return next;
}

/** Promote a suppressed trigger back onto the Timeline. */
export function promoteTrigger(
  timeline: DirectorTimeline,
  triggerId: string,
  componentId?: string,
): DirectorTimeline {
  const next = structuredClone(timeline);
  const trigger = next.triggers.find((t) => t.id === triggerId);
  if (!trigger || trigger.status !== "suppressed") return timeline;

  const compId = componentId ?? inferComponentId(trigger);
  const startFrame = Math.round(trigger.transcriptStart * next.fps);
  const endFrame = Math.max(startFrame + 1, Math.round(trigger.transcriptEnd * next.fps));
  const entryId = `entry-${triggerId}-promoted`;

  next.tracks.motionGraphics.push({
    id: entryId,
    componentId: compId,
    startFrame,
    durationInFrames: endFrame - startFrame,
    layerDepth: layerDepthForComponent(compId),
    props: (trigger.metadata?.props as Record<string, unknown>) ?? {},
    triggerId,
  });

  next.triggers = next.triggers.map((t) =>
    t.id === triggerId
      ? { ...t, status: "realized" as const, resultingEntryId: entryId }
      : t,
  );

  return next;
}

/** Swap the component for an existing motion graphics slot. */
export function swapTimelineComponent(
  timeline: DirectorTimeline,
  entryId: string,
  newComponentId: string,
  props?: Record<string, unknown>,
): DirectorTimeline {
  const next = structuredClone(timeline);
  next.tracks.motionGraphics = next.tracks.motionGraphics.map((e) => {
    if (e.id !== entryId) return e;
    return {
      ...e,
      componentId: newComponentId,
      layerDepth: layerDepthForComponent(newComponentId),
      props: props ?? e.props,
    };
  });
  return next;
}

/** Re-roll a single B-roll slot with a new search query. */
export function rerollBrollEntry(
  timeline: DirectorTimeline,
  entryId: string,
  searchQuery: string,
): DirectorTimeline {
  const next = structuredClone(timeline);
  next.tracks.broll = next.tracks.broll.map((e) =>
    e.id === entryId ? { ...e, assetUrl: "", searchQuery } : e,
  );
  return next;
}

function inferComponentId(trigger: TriggerLogEntry): string {
  const fromMeta = trigger.metadata?.componentId;
  if (typeof fromMeta === "string") return fromMeta;
  return "animated_title";
}

export function listSuppressedTriggers(timeline: DirectorTimeline): TriggerLogEntry[] {
  return timeline.triggers.filter((t) => t.status === "suppressed");
}
