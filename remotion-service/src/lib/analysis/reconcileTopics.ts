import { type ChunkPlan, overlapZone } from "./planChunks";

export interface TopicShift {
  start: number;
  end: number;
  confidence: number;
  topicLabel: string;
}

function mergeAdjacent(topics: TopicShift[]): TopicShift[] {
  if (topics.length === 0) {
    return [];
  }
  const sorted = [...topics].sort((a, b) => a.start - b.start);
  const merged: TopicShift[] = [sorted[0]];

  for (const topic of sorted.slice(1)) {
    const prev = merged[merged.length - 1];
    const sameLabel = prev.topicLabel === topic.topicLabel;
    const adjacent = topic.start <= prev.end + 0.5;
    if (sameLabel && adjacent) {
      prev.end = Math.max(prev.end, topic.end);
      prev.confidence = Math.max(prev.confidence, topic.confidence);
    } else {
      merged.push({ ...topic });
    }
  }
  return merged;
}

/**
 * Merge topic boundaries from overlapping chunk windows.
 * In overlap zones, keep the boundary with higher confidence.
 */
export function reconcileTopics(
  chunkOutputs: Array<{ chunk: ChunkPlan; topics: TopicShift[] }>,
): TopicShift[] {
  if (chunkOutputs.length === 0) {
    return [];
  }
  if (chunkOutputs.length === 1) {
    return mergeAdjacent([...chunkOutputs[0].topics]);
  }

  const owned: TopicShift[] = [];
  for (const { chunk, topics } of chunkOutputs) {
    for (const topic of topics) {
      const mid = (topic.start + topic.end) / 2;
      if (mid >= chunk.coreStart && mid <= chunk.coreEnd) {
        owned.push(topic);
      }
    }
  }

  for (let i = 0; i < chunkOutputs.length - 1; i += 1) {
    const zone = overlapZone(chunkOutputs[i].chunk, chunkOutputs[i + 1].chunk);
    if (!zone) {
      continue;
    }
    const left = chunkOutputs[i].topics.filter(
      (t) => t.start >= zone.start && t.start <= zone.end,
    );
    const right = chunkOutputs[i + 1].topics.filter(
      (t) => t.start >= zone.start && t.start <= zone.end,
    );
    for (const l of left) {
      const match = right.find((r) => Math.abs(r.start - l.start) < 1.5);
      if (match) {
        owned.push(l.confidence >= match.confidence ? l : match);
      } else {
        owned.push(l);
      }
    }
  }

  return mergeAdjacent(owned);
}
