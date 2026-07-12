import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/db.generated'
// In-tab serializing lock for auth ops — see lib/inTabLock.ts for the full
// rationale (single-use refresh tokens; acquire-timeout unwedging).
import { inTabLock } from './inTabLock'

const url  = import.meta.env.VITE_SUPABASE_URL  as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anon) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Copy .env.example to .env.local and fill in values from your Supabase project.',
  )
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
