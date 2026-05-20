import type { SWRConfiguration, Cache } from 'swr'

/**
 * App-wide SWR defaults — cache-first ("show stale, revalidate underneath")
 * Components that need different behaviour can override per-call.
 */
export const swrConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateIfStale: true,
  revalidateOnReconnect: true,
  dedupingInterval: 30_000,
  focusThrottleInterval: 60_000,
  shouldRetryOnError: true,
  errorRetryCount: 2,
  errorRetryInterval: 1500,
  keepPreviousData: true,
}

/**
 * For data that changes rarely (profiles, system_config, consent_versions).
 * Revalidates at most once every 5 minutes; does not re-fetch on every mount.
 */
export const swrConfigSlow: SWRConfiguration = {
  ...swrConfig,
  dedupingInterval: 300_000,
  revalidateIfStale: false,
}

// ----- localStorage persistence -------------------------------------------------
// Persists SWR's in-memory cache to localStorage so returning users see stale
// data instantly on every page mount (not just the dedup window of 30s).
//
// Critical rules:
//   - Only persist data that is safe to show before re-verifying against RLS.
//     A talent's own profile, public role catalogues, consent_versions, and
//     system_config are fine. CV downloads, match scores, points balance,
//     payment state, and anything PDPA-sensitive must opt OUT.
//   - We whitelist by key prefix; everything else stays memory-only.
//   - Per-entry timestamps + a global schema version let us evict stale or
//     incompatible entries without poisoning future loads.
//
// Whitelist exact-string or prefix matches. Anything not matched is
// memory-only (SWR keeps it in the Map; we just don't write it to disk).

const STORAGE_KEY = 'dnj-swr-cache-v1'
const MAX_AGE_MS = 24 * 60 * 60 * 1000   // 24h — older entries get evicted
const MAX_ENTRIES = 200                   // keep localStorage under ~1MB

// A key is persistable if it matches any of these patterns. Stringify keys
// from SWR are either plain strings or JSON.stringify'd tuples
// (e.g. '["talents","abc-123"]'). We match against the raw key string.
const PERSIST_ALLOW: Array<string | RegExp> = [
  // Bootstrap-critical data the user will re-see on every visit
  'system_config',
  'consent_versions',
  /^"?\["?(profile|talents|hiring_managers|roles)/,
  // SEO route catalogues (location_slugs, hire_slugs)
  /silo/i,
  // i18n locale resources (when we add lazy locale loading later)
  /^i18n:/,
]

// Patterns that must NEVER be persisted (defence-in-depth even if a key
// happens to match a broader allow-pattern).
const PERSIST_DENY: Array<string | RegExp> = [
  /resume/i,
  /cv[_-]?download/i,
  /signed[_-]?url/i,
  /points[_-]?balance/i,
  /payment/i,
  /match[_-]?(score|explain)/i,
  /audit[_-]?log/i,
  /ic[_-]?document/i,
]

function isPersistable(key: string): boolean {
  for (const deny of PERSIST_DENY) {
    if (typeof deny === 'string' ? key === deny : deny.test(key)) return false
  }
  for (const allow of PERSIST_ALLOW) {
    if (typeof allow === 'string' ? key.includes(allow) : allow.test(key)) return true
  }
  return false
}

interface PersistedEntry {
  data: unknown
  ts: number
}

type PersistedCache = Record<string, PersistedEntry>

function readPersisted(): PersistedCache {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as PersistedCache
    if (!parsed || typeof parsed !== 'object') return {}
    // Evict expired entries on read
    const now = Date.now()
    for (const k of Object.keys(parsed)) {
      const entry = parsed[k]
      if (!entry || now - entry.ts > MAX_AGE_MS) delete parsed[k]
    }
    return parsed
  } catch { return {} }
}

function writePersisted(cache: PersistedCache): void {
  try {
    // Trim oldest entries if we're over budget (LRU-ish: by ts).
    const keys = Object.keys(cache)
    if (keys.length > MAX_ENTRIES) {
      const sorted = keys
        .map((k) => ({ k, ts: cache[k]?.ts ?? 0 }))
        .sort((a, b) => a.ts - b.ts)
      const toEvict = sorted.slice(0, keys.length - MAX_ENTRIES)
      for (const { k } of toEvict) delete cache[k]
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // Quota errors: clear the whole cache and try once more so we don't
    // leave it in a half-written state.
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* tolerate */ }
  }
}

/**
 * SWR Cache provider that hydrates from localStorage on mount and writes
 * back any whitelisted keys whenever the in-memory map changes.
 *
 * Wire it in `<SWRConfig value={{ ...swrConfig, provider: swrLocalStorageProvider }}>`.
 * Components don't need to change — `useSWR` and `useSupabaseQuery` just
 * inherit instant-first-render from the persisted cache.
 */
export function swrLocalStorageProvider(): Cache {
  const persisted = readPersisted()
  const map = new Map<string, unknown>()
  for (const k of Object.keys(persisted)) {
    const entry = persisted[k]
    if (entry) map.set(k, { data: entry.data })
  }

  // Persist on tab close + visibility-hidden so we don't lose updates between
  // SWR mutations and the next page load. Throttled writes during runtime
  // would be ideal but pageshow/visibility events are cheap and reliable.
  const flush = () => {
    try {
      const out: PersistedCache = {}
      const now = Date.now()
      for (const [k, v] of map.entries()) {
        if (!isPersistable(k)) continue
        // SWR stores entries as { data, error, isValidating, ... }. We only
        // persist `data` (errors and validation flags are not useful across
        // sessions and would mislead the next mount).
        const value = v as { data?: unknown } | undefined
        if (!value || value.data === undefined || value.data === null) continue
        out[k] = { data: value.data, ts: now }
      }
      writePersisted(out)
    } catch { /* tolerate */ }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
  }

  return map as unknown as Cache
}

/** Test-only helper: wipe the persisted SWR cache. */
export function clearSwrPersistedCache(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* tolerate */ }
}
