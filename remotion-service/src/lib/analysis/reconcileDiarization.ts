import { type ChunkPlan } from "./planChunks";

export interface SpeakerSegment {
  start: number;
  end: number;
  confidence: number;
  speakerId: string;
  confidenceSource?: string;
  embedding?: number[];
}

export interface DiarizationChunkOutput {
  chunk: ChunkPlan;
  segments: SpeakerSegment[];
  /** Optional centroid per local speaker id for cross-chunk matching. */
  speakerEmbeddings?: Record<string, number[]>;
}

const SIMILARITY_THRESHOLD = 0.82;

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function segmentsInWindow(
  segments: SpeakerSegment[],
  start: number,
  end: number,
): SpeakerSegment[] {
  return segments.filter((s) => s.end > start && s.start < end);
}

/**
 * Reconcile local speaker IDs across chunks into global, file-consistent IDs.
 * Uses embedding cosine similarity when available; falls back to temporal overlap
 * at chunk boundaries.
 */
export function reconcileDiarization(
  chunkOutputs: DiarizationChunkOutput[],
): SpeakerSegment[] {
  if (chunkOutputs.length === 0) {
    return [];
  }
  if (chunkOutputs.length === 1) {
    return [...chunkOutputs[0].segments];
  }

  const globalMap = new Map<string, string>();
  let nextGlobalId = 0;

  const assignGlobal = (localKey: string): string => {
    const existing = globalMap.get(localKey);
    if (existing) {
      return existing;
    }
    const id = `G${nextGlobalId}`;
    nextGlobalId += 1;
    globalMap.set(localKey, id);
    return id;
  };

  const chunkLocalToGlobal: Array<Map<string, string>> = [];

  for (let i = 0; i < chunkOutputs.length; i += 1) {
    const { chunk, segments, speakerEmbeddings } = chunkOutputs[i];
    const localMap = new Map<string, string>();

    if (i === 0) {
      for (const seg of segments) {
        const key = `${chunk.chunkIndex}:${seg.speakerId}`;
        localMap.set(seg.speakerId, assignGlobal(key));
      }
      chunkLocalToGlobal.push(localMap);
      continue;
    }

    const prev = chunkOutputs[i - 1];
    const prevMap = chunkLocalToGlobal[i - 1];
    const overlapStart = Math.max(prev.chunk.windowStart, chunk.windowStart);
    const overlapEnd = Math.min(prev.chunk.windowEnd, chunk.windowEnd);

    const prevOverlap = segmentsInWindow(prev.segments, overlapStart, overlapEnd);
    const currOverlap = segmentsInWindow(segments, overlapStart, overlapEnd);

    const matchedLocal = new Set<string>();

    for (const currSeg of currOverlap) {
      let bestGlobal: string | null = null;
      let bestScore = SIMILARITY_THRESHOLD;

      const currEmb = speakerEmbeddings?.[currSeg.speakerId];
      for (const prevSeg of prevOverlap) {
        const prevEmb = prev.speakerEmbeddings?.[prevSeg.speakerId];
        let score = 0;
        if (currEmb && prevEmb) {
          score = cosineSimilarity(currEmb, prevEmb);
        } else {
          const overlap =
            Math.min(currSeg.end, prevSeg.end) - Math.max(currSeg.start, prevSeg.start);
          score = overlap > 0 && currSeg.speakerId === prevSeg.speakerId ? 0.85 : 0;
        }
        if (score >= bestScore) {
          bestScore = score;
          bestGlobal = prevMap.get(prevSeg.speakerId) ?? null;
        }
      }

      if (bestGlobal) {
        localMap.set(currSeg.speakerId, bestGlobal);
        matchedLocal.add(currSeg.speakerId);
      }
    }

    for (const seg of segments) {
      if (!localMap.has(seg.speakerId)) {
        const key = `${chunk.chunkIndex}:${seg.speakerId}`;
        localMap.set(seg.speakerId, assignGlobal(key));
      }
    }

    chunkLocalToGlobal.push(localMap);
  }

  const reconciled: SpeakerSegment[] = [];
  for (let i = 0; i < chunkOutputs.length; i += 1) {
    const { chunk, segments } = chunkOutputs[i];
    const localMap = chunkLocalToGlobal[i];
    for (const seg of segments) {
      const mid = (seg.start + seg.end) / 2;
      if (mid < chunk.coreStart || mid > chunk.coreEnd) {
        continue;
      }
      reconciled.push({
        ...seg,
        speakerId: localMap.get(seg.speakerId) ?? seg.speakerId,
      });
    }
  }

  return reconciled.sort((a, b) => a.start - b.start);
}
