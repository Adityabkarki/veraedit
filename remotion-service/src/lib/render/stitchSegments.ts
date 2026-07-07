/**
 * Stitch rendered segment files losslessly via FFmpeg concat (Phase 14).
 * Node helper validates segment list; actual concat runs in Python Celery worker.
 */
export interface SegmentOutput {
  segmentIndex: number;
  storageKey: string;
  localPath?: string;
}

export function buildConcatFileLines(segments: SegmentOutput[]): string {
  const sorted = [...segments].sort((a, b) => a.segmentIndex - b.segmentIndex);
  return sorted
    .map((s) => {
      const path = s.localPath ?? s.storageKey;
      const escaped = path.replace(/'/g, "'\\''");
      return `file '${escaped}'`;
    })
    .join("\n");
}

export function allSegmentsComplete(
  statuses: Array<{ segmentIndex: number; status: string }>,
  expectedCount: number,
): boolean {
  if (statuses.length !== expectedCount) return false;
  return statuses.every((s) => s.status === "complete");
}

export function failedSegmentIndexes(
  statuses: Array<{ segmentIndex: number; status: string }>,
): number[] {
  return statuses.filter((s) => s.status === "failed").map((s) => s.segmentIndex);
}
