import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/db.generated'

const url  = import.meta.env.VITE_SUPABASE_URL  as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anon) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Copy .env.example to .env.local and fill in values from your Supabase project.',
  )
}

// In-tab serializing lock (processLock-equivalent).
//
// We previously used a NO-OP lock to silence the cross-tab "Lock was released
// because another request stole it" warnings that navigator.locks emits. But a
// no-op lock removes ALL serialization — and the assumption that "auto-refresh
// is idempotent" is FALSE: refresh tokens are single-use, so two concurrent
// refreshes (e.g. the auto-refresh tick racing a getSession()/refreshSession()
// call) consume the same refresh token and ONE FAILS. The failed refresh leaves
// an expired/invalid access token, so subsequent queries 401 ("JWT expired") and
// the app appears frozen — and isHM-style lookups silently return 0 rows.
//
// This lock serializes auth operations WITHIN the tab (chaining by lock name),
// which prevents the concurrent-refresh collision, while NOT using
// navigator.locks (so the cross-tab "stolen" warnings stay gone). Equivalent to
// supabase-js's processLock, implemented inline since it isn't re-exported from
// @supabase/supabase-js.
const lockChains = new Map<string, Promise<unknown>>()
function inTabLock<R>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  const prev = lockChains.get(name) ?? Promise.resolve()
  // Run fn only after the previous holder settles (success OR failure).
  const run = prev.then(fn, fn)
  // Keep the chain alive but swallow rejections so one failure doesn't poison
  // the next acquirer.
  lockChains.set(name, run.then(() => undefined, () => undefined))
  return run
}

export const supabase = createClient<Database>(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    lock: inTabLock,
  },
})

export const siteUrl =
  (import.meta.env.VITE_SITE_URL as string | undefined) ??
  (typeof window !== 'undefined' ? window.location.origin : '')
