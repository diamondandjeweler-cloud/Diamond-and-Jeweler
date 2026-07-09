import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/db.generated'
import type { OrgConsultationRow, OrgTierCode } from '../../lib/orgChart'

type OrgConsultationUpdate = Database['public']['Tables']['org_consultations']['Update']

// ── org_consultations: Org Chart Consultant engagements ───────────────────────
// Centralizes reads/writes of the org_consultations table. Mirrors
// systemConfig.ts / points.ts — every function returns the query BUILDER, so
// callers keep their own terminal operator (await / .single) and each .select
// projection is passed through verbatim from the original call site.

/** All consultations, newest first (list view) → { data, error }. */
export function listOrgConsultations() {
  return supabase
    .from('org_consultations')
    .select('*')
    .order('created_at', { ascending: false })
}

/** One consultation by numeric id (`.single()` — detail view load). */
export function getOrgConsultationById(id: number) {
  return supabase
    .from('org_consultations')
    .select('*')
    .eq('id', id)
    .single()
}

/** Patch a consultation row by id (opaque Partial pass-through) → { error }. */
export function updateOrgConsultation(id: number, updates: Partial<OrgConsultationRow>) {
  // OrgConsultationRow types the jsonb columns (members/pairs/analysis) as app
  // interfaces which lack the index signature the generated Json type requires.
  // Cast the opaque patch to the generated Update type at the boundary — the
  // runtime payload is passed through unchanged.
  return supabase.from('org_consultations').update(updates as unknown as OrgConsultationUpdate).eq('id', id)
}

/** Insert a new consultation, returning its id (`.single()` — New form). */
export function insertOrgConsultation(payload: {
  client_company: string
  client_contact_name: string | null
  client_contact_phone: string | null
  client_contact_email: string | null
  client_industry: string | null
  team_size: number
  tier_code: OrgTierCode
  price_myr: number
  payment_status: 'unpaid'
  status: 'collecting'
  members: never[]
  pairs: never[]
  analysis: Record<string, never>
}) {
  return supabase
    .from('org_consultations')
    .insert(payload)
    .select('id')
    .single()
}
