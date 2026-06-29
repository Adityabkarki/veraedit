/** Shared timeline track lane dimensions (headers + clip rows). */
export const TRACK_HEIGHT_PX = 44
export const RULER_HEIGHT_PX = 24
export const TIMELINE_HEADER_WIDTH_PX = 168

/** Ruler spacer + all track rows — keeps headers and clip lanes the same height. */
export function timelineTracksContentHeightPx(trackCount: number): number {
  return RULER_HEIGHT_PX + trackCount * TRACK_HEIGHT_PX
}
