/**
 * CLI entry — reads ResolveTimelineOptions from stdin, writes DirectorTimeline to stdout.
 * Invoked by server.js POST /director/compile via `npx tsx scripts/compile-director.ts`.
 */
import { readFileSync } from "node:fs";
import { runDirector } from "../src/lib/director/resolveTimeline";
import type { ResolveTimelineOptions } from "../src/lib/director/resolveTimeline";

function readStdin(): string {
  return readFileSync(0, "utf-8");
}

try {
  const input = JSON.parse(readStdin()) as ResolveTimelineOptions;
  const timeline = runDirector(input);
  process.stdout.write(JSON.stringify({ success: true, timeline }));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stdout.write(JSON.stringify({ success: false, error: message }));
  process.exit(1);
}
