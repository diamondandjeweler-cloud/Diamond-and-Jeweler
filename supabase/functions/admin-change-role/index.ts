/**
 * admin-change-role
 *
 * Lets an admin change a user's account type (role) and resets their
 * onboarding so they go through the correct flow on next login.
 *
 * Auth: admin JWT only (allowServiceRole: false — every change must be auditable).
 *
 * Request:
 *   POST { user_id: uuid, new_role: 'talent'|'hiring_manager'|'hr_admin', reason: string }
 *
 * Response: { ok: true, old_role: string, new_role: string }
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'
import { logAudit, extractIp } from '../_shared/audit.ts'

const ALLOWED_ROLES = ['talent', 'hiring_manager', 'hr_admin'] as const
type AllowedRole = typeof ALLOWED_ROLES[number]

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, { requiredRoles: ['admin'], allowServiceRole: false })
  if (auth instanceof Response) return auth

  let body: { user_id?: string; new_role?: string; reason?: string }
  try { body = await req.json() }
  catch { return json({ error: 'Invalid JSON' }, 400) }

  if (!body.user_id) return json({ error: 'user_id is required' }, 400)
  if (!body.new_role || !ALLOWED_ROLES.includes(body.new_role as AllowedRole)) {
    return json({ error: `new_role must be one of: ${ALLOWED_ROLES.join(', ')}` }, 400)
  }
  const reason = (body.reason ?? '').trim()
  if (reason.length < 8) return json({ error: 'reason must be at least 8 characters' }, 400)

  const db = adminClient()

  const { data: profile, error: fetchErr } = await db
    .from('profiles')
    .select('id, role, email')
    .eq('id', body.user_id)
    .maybeSingle()
  if (fetchErr) return json({ error: 'Profile lookup failed', detail: fetchErr.message }, 500)
  if (!profile) return json({ error: 'User not found' }, 404)
  if (profile.role === body.new_role) return json({ error: 'User already has that role' }, 400)
  if (profile.role === 'admin') return json({ error: 'Cannot change role of an admin account' }, 403)

  const { error: updateErr } = await db
    .from('profiles')
    .update({ role: body.new_role, onboarding_complete: false })
    .eq('id', body.user_id)
  if (updateErr) return json({ error: 'Update failed', detail: updateErr.message }, 500)

  await logAudit({
    actorId: auth.userId,
    actorRole: auth.role,
    subjectId: body.user_id,
    action: 'admin_action',
    resourceType: 'profile',
    resourceId: body.user_id,
    ip: extractIp(req),
    ua: req.headers.get('user-agent') ?? '',
    metadata: { kind: 'role_change', old_role: profile.role, new_role: body.new_role, reason },
  })

  return json({ ok: true, old_role: profile.role, new_role: body.new_role })
})
