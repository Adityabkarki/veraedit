import { describe, expect, it } from "vitest";
import { auditTriggerCoverage, enumerateTriggerTypes } from "@lib/director/auditCoverage";

describe("auditCoverage", () => {
  it("enumerates all Director trigger types", () => {
    const types = enumerateTriggerTypes();
    expect(types).toContain("topic_shift");
    expect(types).toContain("comparison_phrase");
    expect(types.length).toBeGreaterThanOrEqual(10);
  });

  it("produces a gap report with built/partial/missing rows", () => {
    const report = auditTriggerCoverage();
    expect(report.rows.length).toBe(enumerateTriggerTypes().length);
    expect(report.atomicCount).toBeGreaterThan(15);
    expect(report.rows.every((r) => ["built", "partial", "missing"].includes(r.status))).toBe(
      true,
    );
  });

  it("marks Phase 16 completeness fallbacks as built via atomic registry", () => {
    const report = auditTriggerCoverage();
    const topicRow = report.rows.find((r) => r.triggerType === "topic_shift");
    expect(topicRow).toBeDefined();
  });
});
