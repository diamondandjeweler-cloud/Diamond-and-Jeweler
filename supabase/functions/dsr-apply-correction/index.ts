/**
 * dsr-apply-correction
 *
 * Applies a user-submitted correction proposal to their own records.
 * The proposal lives in data_requests.correction_proposal; the admin
 * triggers this function via DsrPanel when they review + approve.
 *
 * Authorization: admin / service-role only.
 *
 * Allow-list: only these field paths are user-correctable. Anything else
 * is rejected to prevent privilege escalation (e.g. role changes, DOB edits).
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

interface ProposalItem { field: string; new_value: unknown }
interface Proposal { items?: ProposalItem[] }
interface Body { request_id?: string }

/** Every entry is `table.column` and maps to where we scope the update. */
const ALLOW_LIST: Record<string, { table: 'profiles' | 'talents' | 'hiring_managers'; scope: 'id' | 'profile_id' }> = {
  'profiles.full_name':              { table: 'profiles',         scope: 'id' },
  'profiles.phone':                  { table: 'profiles',         scope: 'id' },
  'talents.expected_salary_min':     { table: 'talents',          scope: 'profile_id' },
  'talents.expected_salary_max':     { table: 'talents',          scope: 'profile_id' },
  'talents.is_open_to_offers':       { table: 'talents',          scope: 'profile_id' },
  'talents.privacy_mode':            { table: 'talents',          scope: 'profile_id' },
  'hiring_managers.job_title':       { table: 'hiring_managers',  scope: 'profile_id' },
}

/** Coerce + validate each value based on the field it targets. */
function coerce(field: string, raw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  switch (field) {
    case 'profiles.full_name':
    case 'profiles.phone':
    case 'hiring_managers.job_title':
      return typeof raw === 'string' && raw.length <= 200
        ? { ok: true, value: raw.trim() }
        : { ok: false, error: 'must be a string ≤200 chars' }
    case 'talents.expected_salary_min':
    case 'talents.expected_salary_max':
      return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw < 1_000_000
        ? { ok: true, value: Math.round(raw) }
        : { ok: false, error: 'must be a non-negative integer' }
    case 'talents.is_open_to_offers':
      return typeof raw === 'boolean'
        ? { ok: true, value: raw }
        : { ok: false, error: 'must be a boolean' }
    case 'talents.privacy_mode':
      return ['public', 'anonymous', 'whitelist'].includes(raw as string)
        ? { ok: true, value: raw }
        : { ok: false, error: 'must be public | anonymous | whitelist' }
    default:
      return { ok: false, error: 'unknown field' }
  }
}

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, { requiredRoles: ['admin'] })
  if (auth instanceof Response) return auth

  const body = (await req.json().catch(() => ({}))) as Body
  if (!body.request_id) return json({ error: 'Missing request_id' }, 400)

  const db = adminClient()

  const { data: request, error: reqErr } = await db
    .from('data_requests')
    .select('id, user_id, request_type, status, correction_proposal')
    .eq('id', body.request_id)
    .maybeSingle()
  if (reqErr) return json({ error: reqErr.message }, 500)
  if (!request) return json({ error: 'Request not found' }, 404)
  if (request.request_type !== 'correction') {
    return json({ error: 'Not a correction request' }, 400)
  }

  const proposal = (request.correction_proposal ?? {}) as Proposal
  const items = proposal.items ?? []
  if (items.length === 0) return json({ error: 'No correction items' }, 400)

  const userId = request.user_id
  const applied: Array<{ field: string; new_value: unknown }> = []
  const rejected: Array<{ field: string; reason: string }> = []

  // Group by (table, scope) so we can apply updates in one round-trip per row.
  interface PatchPlan { table: string; scope: string; set: Record<string, unknown> }
  const plans = new Map<string, PatchPlan>()

  for (const item of items) {
    const spec = ALLOW_LIST[item.field]
    if (!spec) { rejected.push({ field: item.field, reason: 'not on allow-list' }); continue }
    const coerced = coerce(item.field, item.new_value)
    if (!coerced.ok) { rejected.push({ field: item.field, reason: coerced.error }); continue }
    const column = item.field.split('.')[1]
    const key = `${spec.table}|${spec.scope}`
    if (!plans.has(key)) plans.set(key, { table: spec.table, scope: spec.scope, set: {} })
    plans.get(key)!.set[column] = coerced.value
    applied.push({ field: item.field, new_value: coerced.value })
  }

  // Execute.
  for (const plan of plans.values()) {
    const { error } = await db.from(plan.table).update(plan.set).eq(plan.scope, userId)
    if (error) return json({ error: `update ${plan.table}: ${error.message}` }, 500)
  }

  // Mark DSR completed + log the outcome into admin_actions for auditability.
  await db.from('data_requests').update({
    status: 'completed',
    resolved_at: new Date().toISOString(),
    resolved_by: auth.isServiceRole ? null : auth.userId,
    notes: [
      request.correction_proposal
        ? `applied=${applied.length} rejected=${rejected.length}`
        : null,
      rejected.length
        ? `rejected: ${rejected.map((r) => `${r.field}(${r.reason})`).join(', ')}`
        : null,
    ].filter(Boolean).join(' · ') || null,
  }).eq('id', request.id)

  await db.from('admin_actions').insert({
    admin_id: auth.isServiceRole ? null : auth.userId,
    action_type: 'dsr_apply_correction',
    target_type: 'data_requests',
    target_id: request.id,
    old_value: { correction_proposal: request.correction_proposal },
    new_value: { applied, rejected },
  })

  return json({ ok: true, applied, rejected })
})
