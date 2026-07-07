import { describe, expect, it } from "vitest";
import {
  brollFailureFallbackComponent,
  resolveComponentWithFallback,
} from "@lib/director/fallbackChain";

describe("fallbackChain", () => {
  it("uses ideal component when built", () => {
    const res = resolveComponentWithFallback("stat_mention", "metric_ticker");
    expect(res.componentId).toBe("metric_ticker");
    expect(res.usedFallback).toBe(false);
  });

  it("falls back when ideal component is missing", () => {
    const res = resolveComponentWithFallback("comparison_phrase", "comparison_chart");
    expect(["comparison_chart", "comparison_table", "topic_title_card"]).toContain(
      res.componentId,
    );
  });

  it("never returns empty — universal fallback for unknown triggers", () => {
    const res = resolveComponentWithFallback("unknown_trigger", "nonexistent_component");
    expect(res.componentId).toBeTruthy();
    expect(res.usedFallback).toBe(true);
    expect(["topic_title_card", "pull_quote_card"]).toContain(res.componentId);
  });

  it("picks pull quote for long emphasis text on broll failure", () => {
    expect(
      brollFailureFallbackComponent("high_emphasis_moment", {
        text: "This is a long emphasized quote that deserves a pull quote card fallback",
      }),
    ).toBe("pull_quote_card");
  });

  it("picks topic title card for topic_shift broll failure", () => {
    expect(brollFailureFallbackComponent("topic_shift", { label: "Growth" })).toBe(
      "topic_title_card",
    );
  });
});
