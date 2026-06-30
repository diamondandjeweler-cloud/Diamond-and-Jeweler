/** Format a number for display in the user's default locale, rendering an em dash for null/undefined. */
export function fmtNumber(v: number | null | undefined): string {
  return v == null ? '—' : v.toLocaleString()
}

/** Format a number as a Malaysian-locale figure ('en-MY'), rendering an em dash for null/undefined. */
export function fmtMoneyMYR(v: number | null | undefined): string {
  return v == null ? '—' : v.toLocaleString('en-MY')
}

/**
 * Back-compat default-locale formatter. Retained because several dashboards
 * import `fmt` directly; aliases the consolidated {@link fmtNumber}.
 */
export const fmt = fmtNumber
