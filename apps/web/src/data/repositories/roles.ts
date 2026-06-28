import { supabase } from '../../lib/supabase'

// ── Role mutations ───────────────────────────────────────────────────────────
// First slice of the roles repository (mirrors src/data/repositories/matches.ts).
// Centralizes every WRITE to the `roles` table so status/expiry/edit/insert all
// flow through one seam; page-specific reads stay inline for now. Functions
// return the query builder so callers can chain (.abortSignal).

/** Patch a role by id (status transition, vacancy expiry, edits). */
export function updateRole(roleId: string, patch: Record<string, unknown>) {
  return supabase.from('roles').update(patch).eq('id', roleId)
}

/** Insert a role row (post-role flow / onboarding draft). */
export function insertRole(row: Record<string, unknown>) {
  return supabase.from('roles').insert(row)
}
