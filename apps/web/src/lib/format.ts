/** Format a number for display, rendering an em dash for null/undefined. */
export function fmt(v: number | null | undefined): string {
  return v == null ? '—' : v.toLocaleString()
}
