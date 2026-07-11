// Pure MYT (Malaysia Time, UTC+8, no DST) calendar helpers — domain layer,
// no React/Supabase imports. Malaysia is a single fixed timezone, so the
// MYT calendar day/time for an instant is always `instant + 8h` read in UTC.

/** Returns the MYT (UTC+8) calendar day 'YYYY-MM-DD' for a given instant. */
export function mytDay(iso: string | number | Date): string {
  const ms = iso instanceof Date ? iso.getTime() : new Date(iso).getTime()
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

/** Returns the MYT (UTC+8) wall-clock time 'HH:MM' for a given instant. */
export function mytHhmm(iso: string | number | Date): string {
  const ms = iso instanceof Date ? iso.getTime() : new Date(iso).getTime()
  const d = new Date(ms + 8 * 3600 * 1000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}
