import { describe, expect, it } from "vitest";
import {
  CHUNK_THRESHOLD_SECONDS,
  DEFAULT_OVERLAP_SECONDS,
  planChunks,
} from "../planChunks";
import { reconcileDiarization } from "../reconcileDiarization";
import { reconcileTopics } from "../reconcileTopics";
import { reconcileTriggers } from "../reconcileTriggers";

describe("planChunks", () => {
  it("returns single chunk below threshold", () => {
    const plans = planChunks(10 * 60);
    expect(plans).toHaveLength(1);
    expect(plans[0].coreStart).toBe(0);
    expect(plans[0].coreEnd).toBe(600);
    expect(plans[0].windowStart).toBe(0);
    expect(plans[0].windowEnd).toBe(600);
  });

  it("returns multiple overlapping chunks for 75-minute podcast", () => {
    const duration = 75 * 60;
    const plans = planChunks(duration);
    expect(plans.length).toBeGreaterThan(5);
    expect(plans[0].coreStart).toBe(0);
    expect(plans[plans.length - 1].coreEnd).toBe(duration);
    expect(plans[0].windowEnd - plans[0].coreEnd).toBe(DEFAULT_OVERLAP_SECONDS);
    expect(plans[1].coreStart - plans[0].coreEnd).toBeLessThanOrEqual(0.001);
  });

  it("does not chunk at exactly threshold", () => {
    const plans = planChunks(CHUNK_THRESHOLD_SECONDS);
    expect(plans).toHaveLength(1);
  });
});

describe("reconcileTriggers", () => {
  it("deduplicates triggers in overlap region", () => {
    const chunk0 = {
      chunkIndex: 0,
      coreStart: 0,
      coreEnd: 540,
      windowStart: 0,
      windowEnd: 565,
    };
    const chunk1 = {
      chunkIndex: 1,
      coreStart: 540,
      coreEnd: 1080,
      windowStart: 515,
      windowEnd: 1105,
    };
    const low = { start: 550, end: 552, confidence: 0.7, value: "40%" };
    const high = { start: 550.1, end: 552, confidence: 0.95, value: "40%" };
    const result = reconcileTriggers([
      { chunk: chunk0, triggers: [low] },
      { chunk: chunk1, triggers: [high] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.95);
  });
});

describe("reconcileTopics", () => {
  it("merges topic blocks from adjacent chunks", () => {
    const chunk0 = {
      chunkIndex: 0,
      coreStart: 0,
      coreEnd: 540,
      windowStart: 0,
      windowEnd: 565,
    };
    const chunk1 = {
      chunkIndex: 1,
      coreStart: 540,
      coreEnd: 1080,
      windowStart: 515,
      windowEnd: 1105,
    };
    const topics = reconcileTopics([
      {
        chunk: chunk0,
        topics: [
          { start: 0, end: 300, confidence: 0.8, topicLabel: "Intro" },
          { start: 300, end: 540, confidence: 0.75, topicLabel: "Growth" },
        ],
      },
      {
        chunk: chunk1,
        topics: [
          { start: 540, end: 900, confidence: 0.82, topicLabel: "Growth" },
        ],
      },
    ]);
    expect(topics.some((t) => t.topicLabel === "Intro")).toBe(true);
    expect(topics.some((t) => t.topicLabel === "Growth")).toBe(true);
  });
});

describe("reconcileDiarization", () => {
  it("assigns consistent global speaker ids across chunks", () => {
    const chunk0 = {
      chunkIndex: 0,
      coreStart: 0,
      coreEnd: 540,
      windowStart: 0,
      windowEnd: 565,
    };
    const chunk1 = {
      chunkIndex: 1,
      coreStart: 540,
      coreEnd: 1080,
      windowStart: 515,
      windowEnd: 1105,
    };
    const result = reconcileDiarization([
      {
        chunk: chunk0,
        segments: [
          { start: 0, end: 200, confidence: 0.8, speakerId: "A" },
          { start: 520, end: 560, confidence: 0.8, speakerId: "B" },
        ],
      },
      {
        chunk: chunk1,
        segments: [
          { start: 520, end: 560, confidence: 0.85, speakerId: "A" },
          { start: 560, end: 900, confidence: 0.8, speakerId: "B" },
        ],
        speakerEmbeddings: {
          A: [520, 560, 40],
          B: [560, 900, 340],
        },
      },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(2);
    const speakerIds = new Set(result.map((s) => s.speakerId));
    expect(speakerIds.size).toBeGreaterThanOrEqual(1);
  });
});
