/**
 * CLI entry — reads PrepareStyledShortOptions from stdin, writes DirectorTimeline to stdout.
 */
import { readFileSync } from "node:fs";
import {
  prepareStyledShort,
  prepareStyledShortBase,
} from "../src/lib/director/prepareStyledShort";
import type { PrepareStyledShortOptions } from "../src/lib/director/prepareStyledShort";

try {
  const input = JSON.parse(readFileSync(0, "utf-8")) as PrepareStyledShortOptions & {
    baseOnly?: boolean;
  };
  const timeline = input.baseOnly
    ? prepareStyledShortBase(input)
    : prepareStyledShort(input);
  process.stdout.write(JSON.stringify({ success: true, timeline }));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stdout.write(JSON.stringify({ success: false, error: message }));
  process.exit(1);
}
