/**
 * invite-hm
 *
 * HR admin invites a hiring manager into their (verified) company.
 *
 * Flow:
 *   1. Authenticate caller as hr_admin OR admin.
 *   2. Look up caller's company by primary_hr_email. Require verified=true.
 *   3. If the invitee email already has a profile → link HM to that profile.
 *      Else → Supabase `inviteUserByEmail` (sends magic-link automatically).
 *   4. Insert hiring_managers row (idempotent per profile).
 *   5. Fire 'hm_invited' notification.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

interface Payload {
  email?: string
  full_name?: string
  job_title?: string
}

const SITE = Deno.env.get('SITE_URL') ?? 'https://diamondandjeweler.com'

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, { requiredRoles: ['hr_admin', 'admin'] })
  if (auth instanceof Response) return auth

  const body = (await req.json().catch(() => ({}))) as Payload
  if (!body.email || !body.full_name || !body.job_title) {
    return json({ error: 'email, full_name, job_title are required' }, 400)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return json({ error: 'Invalid email' }, 400)
  }

  const db = adminClient()

  // Resolve the caller's company via primary_hr_email (admin bypasses via
  // body-provided company_id — not implemented in M3, admins can promote
  // users manually through SQL).
  const { data: company, error: cErr } = await db
    .from('companies')
    .select('id, verified')
    .eq('primary_hr_email', auth.email)
    .maybeSingle()
  if (cErr) return json({ error: cErr.message }, 500)
  if (!company) return json({ error: 'No company registered to your HR email' }, 400)
  if (!company.verified) {
    return json({ error: 'Company must be verified before inviting hiring managers' }, 400)
  }

  // See if the invitee already has a profile (they may have signed up as talent).
  const { data: existingProfile } = await db
    .from('profiles').select('id, role').eq('email', body.email).maybeSingle()

  let userId: string
  if (existingProfile) {
    userId = existingProfile.id
    // Do not silently change an existing role. If they're already HM, fine.
    // If they're talent/hr_admin, we still link them as HM of this company (role stays).
  } else {
    const { data: inv, error: invErr } = await db.auth.admin.inviteUserByEmail(body.email, {
      redirectTo: `${SITE}/auth/callback`,
      data: { full_name: body.full_name, role: 'hiring_manager' },
    })
    if (invErr || !inv.user) {
      return json({ error: invErr?.message ?? 'Invite failed' }, 500)
    }
    userId = inv.user.id

    // The on_auth_user_created trigger seeds public.profiles from raw_user_meta_data.
    // In case the trigger path differs for admin invites, upsert for safety.
    const { error: upErr } = await db.from('profiles').upsert(
      { id: userId, email: body.email, full_name: body.full_name, role: 'hiring_manager' },
      { onConflict: 'id' },
    )
    if (upErr) return json({ error: `Profile upsert failed: ${upErr.message}` }, 500)
  }

  // One HM row per profile — don't duplicate if already linked to this company.
  const { data: existingHm } = await db.from('hiring_managers')
    .select('id, company_id').eq('profile_id', userId).maybeSingle()
  if (existingHm) {
    if (existingHm.company_id !== company.id) {
      return json({
        error: 'This user is already a hiring manager at another company.',
      }, 409)
    }
    return json({ ok: true, user_id: userId, already_invited: true })
  }

  const { error: hmErr } = await db.from('hiring_managers').insert({
    profile_id: userId,
    company_id: company.id,
    job_title: body.job_title,
  })
  if (hmErr) return json({ error: hmErr.message }, 500)

  // Optional in-app heads-up (the magic-link email itself is sent by Supabase).
  const notifyUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/notify`
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  fetch(notifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
    body: JSON.stringify({
      user_id: userId,
      type: 'hm_invited',
      data: { company_id: company.id },
    }),
  }).catch(() => { /* best effort */ })

  return json({ ok: true, user_id: userId })
})
