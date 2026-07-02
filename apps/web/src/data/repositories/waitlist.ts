import { supabase } from '../../lib/supabase'

// ── waitlist: recruitment marketing waitlist ─────────────────────────────────
// Centralizes the public `waitlist` table (signup form + admin WaitlistPanel).
// NOT the restaurant-schema waitlist in lib/restaurant/store.ts — that module is
// a hard exclusion and keeps its own access path. Functions return the query
// BUILDER so callers keep their own terminal operator (await / .then), and each
// .select projection / payload is passed through verbatim from the call site.

/** Newest 500 waitlist rows for the admin panel — caller chains its own .then. */
export function listWaitlist() {
  return supabase
    .from('waitlist')
    .select('id, email, full_name, intended_role, approved, created_at')
    .order('created_at', { ascending: false })
    .limit(500)
}

/** Mark one waitlist row approved (timestamped now) → { error }. */
export function approveWaitlistEntry(id: string) {
  return supabase
    .from('waitlist')
    .update({ approved: true, approved_at: new Date().toISOString() })
    .eq('id', id)
}

/** Insert a waitlist signup (insert-only, deliberately NO .select()) → { error }. */
export function addWaitlistEntry(row: {
  email: string
  full_name: string
  intended_role: 'talent' | 'hr_admin'
  note: string | null
}) {
  return supabase.from('waitlist').insert(row)
}
