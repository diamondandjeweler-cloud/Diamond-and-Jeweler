import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/db.generated'
// In-tab serializing lock for auth ops — see lib/inTabLock.ts for the full
// rationale (single-use refresh tokens; acquire-timeout unwedging).
import { inTabLock } from './inTabLock'

function readEnv(): { url: string; anon: string } {
  const url  = import.meta.env.VITE_SUPABASE_URL  as string | undefined
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !anon) {
    throw new Error(
      'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env.local and fill in values from your Supabase project.',
    )
  }
  return { url, anon }
}

// Memoized singleton. Created lazily by getSupabase() on first use rather than
// at module-evaluation time, so an anon route that never touches Supabase does
// not construct GoTrueClient (+ its storage / auto-refresh machinery) at boot.
let client: SupabaseClient<Database> | null = null

/**
 * Lazily create + memoize the browser Supabase client (single instance per tab).
 *
 * The `auth.lock: inTabLock` option is LOAD-BEARING and preserved verbatim from
 * the previous eager `createClient` call — it serializes auth operations within
 * the tab so two concurrent refreshes can't consume the same single-use refresh
 * token (see lib/inTabLock.ts). Do not remove or weaken it.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (client) return client
  const { url, anon } = readEnv()
  client = createClient<Database>(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      lock: inTabLock,
    },
  })
  return client
}

/**
 * Back-compat named export: a thin lazy proxy over getSupabase() so the existing
 * `import { supabase }` call sites keep working unchanged while client creation
 * stays deferred to first property access. Methods are bound to the real client
 * so supabase-js's private class fields resolve correctly through the proxy.
 */
export const supabase: SupabaseClient<Database> = new Proxy(
  {} as SupabaseClient<Database>,
  {
    get(_target, prop) {
      const c = getSupabase()
      const value = Reflect.get(c as object, prop, c)
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(c)
        : value
    },
    set(_target, prop, value) {
      return Reflect.set(getSupabase() as object, prop, value)
    },
    has(_target, prop) {
      return Reflect.has(getSupabase() as object, prop)
    },
  },
)

export const siteUrl =
  (import.meta.env.VITE_SITE_URL as string | undefined) ??
  (typeof window !== 'undefined' ? window.location.origin : '')
