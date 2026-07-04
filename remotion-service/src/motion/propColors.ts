/**
 * Shared prop color resolution for Remotion motion elements.
 */

export function propTextColor(
  props: Record<string, unknown>,
  fallback = "#FFFFFF",
): string {
  const tc = props.textColor ?? props.color
  return tc != null ? String(tc) : fallback
}

export function propAccentColor(
  props: Record<string, unknown>,
  fallback = "#FFD600",
): string {
  const ac = props.accentColor ?? props.brandColor
  return ac != null ? String(ac) : fallback
}

export function propStrokeColor(
  props: Record<string, unknown>,
  fallback = "#000000",
): string {
  const sc = props.strokeColor ?? props.accentColor
  return sc != null ? String(sc) : fallback
}
