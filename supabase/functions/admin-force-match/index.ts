/**
 * admin-force-match
 *
 * Lets an admin manually create a match between a talent and a role,
 * bypassing the normal scoring + approval pipeline. Intended for cold-start
 * cases (a verified company with no organic candidates yet) and for ops
 * remediation when the matching engine is misbehaving.
 *
 * Auth: admin role JWT only (no service-role bypass — every force-match must
 * be auditable to a human).
 *
 * Request:
 *   POST { role_id: uuid, talent_id: uuid, reason: string, score?: number }
 *
 * Response: { match_id: uuid }
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'
import { logAudit, extractIp } from '../_shared/audit.ts'

interface Body {
  role_id: string
  talent_id: string
  reason: string
  score?: number
}

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, {
    requiredRoles: ['admin'],
    allowServiceRole: false,
  })
  if (auth instanceof Response) return auth

  let body: Body
  try { body = (await req.json()) as Body }
  catch { return json({ error: 'Invalid JSON' }, 400) }

  if (!body.role_id || !body.talent_id) {
    return json({ error: 'role_id and talent_id are required' }, 400)
  }
  const reason = (body.reason ?? '').trim()
  if (reason.length < 8) {
    return json({ error: 'reason must be at least 8 characters — admins must justify force-matches' }, 400)
  }
  const score = typeof body.score === 'number'
    ? Math.max(0, Math.min(100, body.score))
    : 60 // sensible default for ops-injected matches

  const db = adminClient()

  const { data: role, error: roleErr } = await db
    .from('roles')
    .select('id, status, hiring_manager_id')
    .eq('id', body.role_id)
    .maybeSingle()
  if (roleErr) return json({ error: 'Role lookup failed', detail: roleErr.message }, 500)
  if (!role) return json({ error: 'Role not found' }, 404)
  if (role.status !== 'active') return json({ error: `Role is ${role.status}` }, 400)

  const { data: talent, error: talentErr } = await db
    .from('talents')
    .select('id, profile_id, is_open_to_offers')
    .eq('id', body.talent_id)
    .maybeSingle()
  if (talentErr) return json({ error: 'Talent lookup failed', detail: talentErr.message }, 500)
  if (!talent) return json({ error: 'Talent not found' }, 404)

  // Idempotency: if an active match already exists for this pair, return it.
  const { data: existing } = await db
    .from('matches')
    .select('id, status')
    .eq('role_id', body.role_id)
    .eq('talent_id', body.talent_id)
    .in('status', ['generated', 'viewed', 'accepted_by_talent', 'invited_by_manager'])
    .maybeSingle()
  if (existing) {
    return json({ match_id: existing.id, already_existed: true, status: existing.status })
  }

  const insertPayload = {
    role_id: body.role_id,
    talent_id: body.talent_id,
    compatibility_score: score,
    status: 'generated',
    public_reasoning: {
      summary: 'Match created manually by an admin.',
      strengths: [],
      cautions: ['This match was force-created and bypassed automated scoring.'],
      culture_alignment: null,
    },
    application_summary: null,
    is_force_match: true,
    force_match_reason: reason.slice(0, 500),
    force_matched_by: auth.userId,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }

  const { data: inserted, error: insertErr } = await db
    .from('matches')
    .insert(insertPayload)
    .select('id')
    .single()
  if (insertErr) return json({ error: 'Match insert failed', detail: insertErr.message }, 500)

  await logAudit({
    actorId: auth.userId,
    actorRole: 'admin',
    subjectId: talent.profile_id,
    action: 'admin_action',
    resourceType: 'match',
    resourceId: inserted.id,
    ip: extractIp(req),
    ua: req.headers.get('user-agent') ?? '',
    metadata: {
      kind: 'force_match',
      role_id: body.role_id,
      talent_id: body.talent_id,
      score,
      reason,
    },
  })

  return json({ match_id: inserted.id, already_existed: false })
})
