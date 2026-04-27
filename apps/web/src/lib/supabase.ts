import { createClient } from '@supabase/supabase-js'

const url  = import.meta.env.VITE_SUPABASE_URL  as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anon) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Copy .env.example to .env.local and fill in values from your Supabase project.',
  )
}

// Disable cross-tab Web Locks. The default lock causes
// "Lock was released because another request stole it" errors when multiple
// tabs share localStorage or when supabase-js's auto-refresh races with
// our own auth.getSession() calls. With auto-refresh idempotent, a no-op
// lock is safe and eliminates the contention.
function noopLock<R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  return fn()
}

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    lock: noopLock,
  },
})

export const siteUrl =
  (import.meta.env.VITE_SITE_URL as string | undefined) ??
  (typeof window !== 'undefined' ? window.location.origin : '')
