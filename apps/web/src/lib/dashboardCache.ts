/**
 * Lightweight per-user localStorage cache for dashboard snapshots.
 *
 * Purpose: the dashboards (HR / Talent / HM / admin KPI) used to gate the
 * entire render behind `if (loading) return <LoadingSpinner />`. We've removed
 * those gates and now skeleton individual data slots. This cache lets a
 * returning user see their last-known KPI numbers + lists INSTANTLY on mount,
 * before the live Supabase queries return.
 *
 * Design rules:
 *   - Keys are namespaced `dnj.dash:<surface>:<userId>` (or no user for global
 *     admin data). Cross-user reads are impossible by construction.
 *   - 24h TTL: older snapshots are evicted on read.
 *   - Failures (quota, parse) silently return null — never throw into the UI.
 *   - Do NOT cache PDPA-sensitive payloads (CV URLs, candidate IDs, match
 *     scores attributed to specific people, payment state, points balance).
 *     Cache only aggregate counts and self-authored content (own role titles,
 *     own HM list, own roles posted).
 */

const PREFIX = 'dnj.dash:'
const TTL_MS = 24 * 60 * 60 * 1000  // 24h

interface Envelope<T> {
  ts: number
  data: T
}

function buildKey(surface: string, userId?: string | null): string {
  return userId ? `${PREFIX}${surface}:${userId}` : `${PREFIX}${surface}`
}

/**
 * Synchronously read a dashboard snapshot. Returns `null` if the cache is
 * empty, expired, or unparseable. Use the return value to initialise React
 * state so the first render already has data:
 *
 *   const [hms, setHms] = useState<HMRow[] | null>(
 *     () => readDashCache<HRSnapshot>('hr_dashboard', userId)?.hms ?? null
 *   )
 */
export function readDashCache<T>(surface: string, userId?: string | null): T | null {
  try {
    const raw = localStorage.getItem(buildKey(surface, userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Envelope<T>
    if (!parsed || typeof parsed.ts !== 'number') return null
    if (Date.now() - parsed.ts > TTL_MS) {
      try { localStorage.removeItem(buildKey(surface, userId)) } catch { /* tolerate */ }
      return null
    }
    return parsed.data
  } catch { return null }
}

/**
 * Persist a fresh snapshot. Call after every successful load (and after
 * mutations that change cached values, e.g. when a new HM is added).
 */
export function writeDashCache<T>(surface: string, userId: string | null | undefined, data: T): void {
  try {
    localStorage.setItem(
      buildKey(surface, userId),
      JSON.stringify({ ts: Date.now(), data } satisfies Envelope<T>),
    )
  } catch {
    // Quota or serialization failure — best-effort, ignore.
  }
}

/**
 * Evict cached snapshot(s) for a surface. With `userId` set, evicts that user's
 * entry; without, sweeps all entries for the surface (useful in sign-out).
 */
export function clearDashCache(surface: string, userId?: string | null): void {
  try {
    if (userId !== undefined) {
      localStorage.removeItem(buildKey(surface, userId ?? null))
      return
    }
    const prefix = `${PREFIX}${surface}`
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith(prefix)) localStorage.removeItem(k)
    })
  } catch { /* tolerate */ }
}

/** Sweep ALL dashboard cache entries — call on sign-out. */
export function clearAllDashCaches(): void {
  try {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith(PREFIX)) localStorage.removeItem(k)
    })
  } catch { /* tolerate */ }
}
