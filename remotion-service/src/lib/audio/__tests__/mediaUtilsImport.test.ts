import { describe, expect, it } from "vitest";
import { getAudioData, visualizeAudio } from "@remotion/media-utils";

describe("@remotion/media-utils imports", () => {
  it("exports getAudioData and visualizeAudio as functions", () => {
    expect(typeof getAudioData).toBe("function");
    expect(typeof visualizeAudio).toBe("function");
  });
});
