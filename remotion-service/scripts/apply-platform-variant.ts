/**
 * CLI — apply platform render variant to an existing timeline (no re-compile).
 */
import { readFileSync } from "node:fs";
import { applyPlatformVariantToTimeline } from "../src/lib/director/platformRenderVariant";
import type { PlatformRenderVariant } from "../src/lib/director/platformRenderVariant";
import type { DirectorTimeline } from "../src/types/timeline";

interface Input {
  timeline: DirectorTimeline;
  platformVariant: PlatformRenderVariant;
}

try {
  const input = JSON.parse(readFileSync(0, "utf-8")) as Input;
  const timeline = applyPlatformVariantToTimeline(
    input.timeline,
    input.platformVariant,
  );
  process.stdout.write(JSON.stringify({ success: true, timeline }));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stdout.write(JSON.stringify({ success: false, error: message }));
  process.exit(1);
}
