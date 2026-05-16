/**
 * switch-account-type
 *
 * Lets a user correct their account type (talent ↔ hiring_manager ↔ hr_admin)
 * before onboarding is complete. Blocked once onboarding_complete = true.
 *
 * Auth: any authenticated user (no service-role).
 *
 * Request:
 *   POST { new_role: 'talent'|'hiring_manager'|'hr_admin' }
 *
 * Response: { ok: true, new_role: string }
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

  const auth = await authenticate(req, { allowServiceRole: false })
  if (auth instanceof Response) return auth

  let body: { new_role?: string }
  try { body = await req.json() }
  catch { return json({ error: 'Invalid JSON' }, 400) }

  if (!body.new_role || !ALLOWED_ROLES.includes(body.new_role as AllowedRole)) {
    return json({ error: `new_role must be one of: ${ALLOWED_ROLES.join(', ')}` }, 400)
  }

  const db = adminClient()

  const { data: profile, error: fetchErr } = await db
    .from('profiles')
    .select('id, role, onboarding_complete')
    .eq('id', auth.userId)
    .maybeSingle()
  if (fetchErr) return json({ error: 'Profile lookup failed' }, 500)
  if (!profile) return json({ error: 'Profile not found' }, 403)

  if (profile.onboarding_complete) {
    return json({ error: 'Account type can only be changed before onboarding is complete. Contact support.' }, 403)
  }
  if (profile.role === body.new_role) return json({ error: 'Already set to that account type' }, 400)

  const { error: updateErr } = await db
    .from('profiles')
    .update({ role: body.new_role })
    .eq('id', auth.userId)
  if (updateErr) return json({ error: 'Update failed', detail: updateErr.message }, 500)

  await logAudit({
    actorId: auth.userId,
    actorRole: auth.role,
    subjectId: auth.userId,
    action: 'profile_updated',
    resourceType: 'profile',
    resourceId: auth.userId,
    ip: extractIp(req),
    ua: req.headers.get('user-agent') ?? '',
    metadata: { kind: 'self_role_switch', old_role: profile.role, new_role: body.new_role },
  })

  return json({ ok: true, new_role: body.new_role })
})
