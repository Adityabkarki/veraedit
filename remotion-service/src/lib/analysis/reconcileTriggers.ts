import { type ChunkPlan, overlapZone } from "./planChunks";

export interface TimestampedTrigger {
  start: number;
  end?: number;
  confidence: number;
  [key: string]: unknown;
}

const DEDUPE_TOLERANCE_SECONDS = 1.5;

function triggerIdentity(item: TimestampedTrigger): string {
  const label = item.type ?? item.label ?? item.value ?? item.text ?? "";
  return String(label).toLowerCase();
}

function inZone(item: TimestampedTrigger, start: number, end: number): boolean {
  const endTs = item.end ?? item.start;
  const mid = (item.start + endTs) / 2;
  return mid >= start && mid <= end;
}

function isDuplicate(a: TimestampedTrigger, b: TimestampedTrigger): boolean {
  if (triggerIdentity(a) !== triggerIdentity(b)) {
    return false;
  }
  return Math.abs(a.start - b.start) <= DEDUPE_TOLERANCE_SECONDS;
}

/**
 * Deduplicate triggers detected in overlapping chunk windows.
 * Keeps highest-confidence entry when duplicates appear in overlap regions.
 */
export function reconcileTriggers<T extends TimestampedTrigger>(
  chunkOutputs: Array<{ chunk: ChunkPlan; triggers: T[] }>,
): T[] {
  if (chunkOutputs.length === 0) {
    return [];
  }
  if (chunkOutputs.length === 1) {
    return [...chunkOutputs[0].triggers];
  }

  const merged = chunkOutputs.flatMap(({ triggers }) => triggers);
  const overlapRanges: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < chunkOutputs.length - 1; i += 1) {
    const zone = overlapZone(chunkOutputs[i].chunk, chunkOutputs[i + 1].chunk);
    if (zone) {
      overlapRanges.push(zone);
    }
  }

  const kept: T[] = [];

  for (const item of merged.sort((a, b) => a.start - b.start)) {
    const inOverlap = overlapRanges.some((z) => inZone(item, z.start, z.end));
    if (!inOverlap) {
      kept.push(item);
      continue;
    }

    const duplicateIdx = kept.findIndex((existing) => isDuplicate(existing, item));
    if (duplicateIdx >= 0) {
      if (item.confidence > kept[duplicateIdx].confidence) {
        kept[duplicateIdx] = item;
      }
      continue;
    }

    kept.push(item);
  }

  return kept.sort((a, b) => a.start - b.start);
}
