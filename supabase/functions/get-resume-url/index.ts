/**
 * get-resume-url
 *
 * Returns a short-lived signed URL for a talent's résumé, scoped to a match.
 *
 * Authorization rules:
 *   - Caller must be the matched HM (or HR of the HM's company), or admin.
 *   - The HM's company must be verified (companies.verified = true). If not,
 *     return 403 with a message that surfaces to the UI as "ask HR to verify".
 *   - The match must be in an active (non-terminal) state.
 *   - Talent must have a resume_path on file.
 *
 * Returns: { signed_url: string, expires_in: 3600 }
 * Audits:  inserts `resume_revealed` into audit_log.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

interface Body {
  match_id: string
}

const TERMINAL_STATUSES = new Set([
  'expired',
  'cancelled',
  'declined_by_talent',
  'declined_by_manager',
])

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, {
    requiredRoles: ['hiring_manager', 'hr_admin', 'admin'],
  })
  if (auth instanceof Response) return auth

  let body: Body
  try { body = (await req.json()) as Body }
  catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!body.match_id) return json({ error: 'match_id required' }, 400)

  const db = adminClient()

  // Resolve the match → role → company → talent in one round-trip.
  const { data: match, error: matchErr } = await db
    .from('matches')
    .select(`
      id, status, talent_id,
      roles!inner ( id, hiring_manager_id,
        hiring_managers!inner ( id, profile_id, company_id,
          companies!inner ( id, verified )
        )
      ),
      talents!inner ( id, resume_path )
    `)
    .eq('id', body.match_id)
    .maybeSingle()

  if (matchErr) return json({ error: matchErr.message }, 500)
  if (!match) return json({ error: 'Match not found' }, 404)

  // The Supabase JS types can't infer the nested shape from a runtime !inner join,
  // so we narrow defensively.
  const role = (match as unknown as { roles: { hiring_manager_id: string; hiring_managers: { profile_id: string; company_id: string; companies: { id: string; verified: boolean } } } }).roles
  const hm = role.hiring_managers
  const company = hm.companies
  const talent = (match as unknown as { talents: { resume_path: string | null } }).talents
  const status = (match as { status: string }).status
  const talentId = (match as { talent_id: string }).talent_id

  // Authorization — admin always allowed.
  if (!auth.isServiceRole && auth.role !== 'admin') {
    const isMatchedHm = hm.profile_id === auth.userId
    let isHrOfCompany = false
    if (!isMatchedHm) {
      // HR admins of the HM's company can also pull résumés (e.g. they're
      // arranging interviews on behalf of the HM). Authorize via the
      // AUTHORITATIVE HR↔company link — companies.primary_hr_email must equal
      // the caller's email — NOT profiles.company_id, which is self-settable
      // (any user could point it at a stranger's company to read résumés).
      // Same link used by invite-hm/link-hm and the auth_hr_company_id() RLS helper.
      const { data: hrCompany } = await db
        .from('companies')
        .select('id')
        .eq('id', company.id)
        .eq('primary_hr_email', auth.email)
        .maybeSingle()
      if (hrCompany) isHrOfCompany = true
    }
    if (!isMatchedHm && !isHrOfCompany) {
      return json({ error: 'Not authorized for this match' }, 403)
    }
  }

  // Gate on company verification — résumé reveal requires a verified company.
  if (!company.verified) {
    return json({
      error: 'company_not_verified',
      message: 'Your company profile must be verified by HR before résumés unlock. Ask your HR manager to upload SSM + business license.',
    }, 403)
  }

  if (TERMINAL_STATUSES.has(status)) {
    return json({ error: `Match is ${status} — résumé no longer available.` }, 410)
  }

  if (!talent.resume_path) {
    return json({ error: 'This talent has not uploaded a résumé yet.' }, 404)
  }

  // Mint a 1-hour signed URL from the private `resumes` bucket.
  const { data: signed, error: signErr } = await db.storage
    .from('resumes')
    .createSignedUrl(talent.resume_path, 3600)
  if (signErr || !signed?.signedUrl) {
    return json({ error: signErr?.message ?? 'Could not sign résumé URL' }, 500)
  }

  // Audit the reveal (best-effort — don't block the response if logging fails).
  try {
    await db.rpc('log_audit_event', {
      p_actor_id: auth.userId,
      p_actor_role: auth.role,
      p_subject_id: talentId,
      p_action: 'resume_revealed',
      p_resource_type: 'match',
      p_resource_id: body.match_id,
      p_metadata: { status_at_reveal: status, role_id: role.hiring_manager_id },
    })
  } catch (_) { /* tolerate */ }

  return new Response(
    JSON.stringify({ signed_url: signed.signedUrl, expires_in: 3600 }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
