/**
 * link-hm
 *
 * HR admin links a floating HM (company_id IS NULL) into their company.
 *
 * Two modes:
 *   request — creates a pending company_hm_link_requests row; HM must accept.
 *   direct  — immediately sets hiring_managers.company_id; HM notified after.
 *
 * HM accept/decline: PATCH with { request_id, action: 'accept' | 'decline' }
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

interface Body {
  mode?: 'request' | 'direct'
  hm_id?: string
  // For HM accept/decline
  request_id?: string
  action?: 'accept' | 'decline'
}

const SITE = Deno.env.get('SITE_URL') ?? 'https://diamondandjeweler.com'

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (!['POST', 'PATCH'].includes(req.method)) return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, { requiredRoles: ['hr_admin', 'hiring_manager', 'admin'] })
  if (auth instanceof Response) return auth

  const body = (await req.json().catch(() => ({}))) as Body
  const db = adminClient()

  // ── HM responds to a pending request ──────────────────────────────────────
  if (req.method === 'PATCH') {
    if (!body.request_id || !body.action) {
      return json({ error: 'request_id and action are required' }, 400)
    }
    if (!['accept', 'decline'].includes(body.action)) {
      return json({ error: 'action must be accept or decline' }, 400)
    }

    // Load the request and verify this HM owns it.
    const { data: req_ } = await db.from('company_hm_link_requests')
      .select('id, status, company_id, hm_id, hiring_managers(profile_id)')
      .eq('id', body.request_id).maybeSingle()
    if (!req_) return json({ error: 'Link request not found' }, 404)
    if (req_.status !== 'pending') return json({ error: 'Request is no longer pending' }, 409)

    const hm = req_.hiring_managers as unknown as { profile_id: string } | null
    if (auth.role !== 'admin' && hm?.profile_id !== auth.userId) {
      return json({ error: 'Not your link request' }, 403)
    }

    if (body.action === 'decline') {
      await db.from('company_hm_link_requests')
        .update({ status: 'declined', resolved_at: new Date().toISOString() })
        .eq('id', body.request_id)
      return json({ ok: true, status: 'declined' })
    }

    // Accept: link the HM to the company.
    const { error: linkErr } = await db.from('hiring_managers')
      .update({ company_id: req_.company_id })
      .eq('id', req_.hm_id)
    if (linkErr) return json({ error: linkErr.message }, 500)

    await db.from('company_hm_link_requests')
      .update({ status: 'accepted', resolved_at: new Date().toISOString() })
      .eq('id', body.request_id)

    return json({ ok: true, status: 'accepted' })
  }

  // ── HR admin initiates a link ──────────────────────────────────────────────
  if (auth.role !== 'hr_admin' && auth.role !== 'admin') {
    return json({ error: 'Only HR admins can initiate a link' }, 403)
  }
  if (!body.hm_id || !body.mode) {
    return json({ error: 'hm_id and mode are required' }, 400)
  }
  if (!['request', 'direct'].includes(body.mode)) {
    return json({ error: 'mode must be request or direct' }, 400)
  }

  // Resolve the HR admin's company.
  const { data: company } = await db.from('companies')
    .select('id, name, verified').eq('primary_hr_email', auth.email).maybeSingle()
  if (!company) return json({ error: 'No company registered to your HR email' }, 400)
  if (!company.verified) return json({ error: 'Company must be verified before linking hiring managers' }, 400)

  // Ensure the target HM exists and is floating (company_id IS NULL) or already in this company.
  const { data: hm } = await db.from('hiring_managers')
    .select('id, company_id, profile_id, profiles(full_name, email)')
    .eq('id', body.hm_id).maybeSingle()
  if (!hm) return json({ error: 'Hiring manager not found' }, 404)
  if (hm.company_id !== null && hm.company_id !== company.id) {
    return json({ error: 'This hiring manager is already linked to another company' }, 409)
  }
  if (hm.company_id === company.id) {
    return json({ ok: true, already_linked: true })
  }

  const hmProfile = hm.profiles as unknown as { full_name: string; email: string } | null
  const notifyUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/notify`
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  if (body.mode === 'direct') {
    // Directly assign company — no consent needed.
    const { error: linkErr } = await db.from('hiring_managers')
      .update({ company_id: company.id }).eq('id', body.hm_id)
    if (linkErr) return json({ error: linkErr.message }, 500)

    // Cancel any pending request for this HM.
    await db.from('company_hm_link_requests')
      .update({ status: 'accepted', resolved_at: new Date().toISOString() })
      .eq('hm_id', body.hm_id).eq('status', 'pending')

    fetch(notifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
      body: JSON.stringify({
        user_id: hm.profile_id,
        type: 'hm_linked_direct',
        data: { company_id: company.id, company_name: company.name },
      }),
    }).catch(() => {/* best effort */})

    return json({ ok: true, mode: 'direct', company_id: company.id })
  }

  // Request mode — insert pending link request.
  const { data: reqRow, error: reqErr } = await db.from('company_hm_link_requests').insert({
    company_id: company.id,
    hm_id: body.hm_id,
    requested_by: auth.userId,
  }).select('id').single()
  if (reqErr) {
    if (reqErr.code === '23505') return json({ error: 'A pending request already exists for this hiring manager' }, 409)
    return json({ error: reqErr.message }, 500)
  }

  // Notify HM.
  const acceptUrl = `${SITE}/hm/link-request/${reqRow.id}`
  fetch(notifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
    body: JSON.stringify({
      user_id: hm.profile_id,
      type: 'hm_link_request',
      data: {
        request_id: reqRow.id,
        company_id: company.id,
        company_name: company.name,
        accept_url: acceptUrl,
      },
    }),
  }).catch(() => {/* best effort */})

  return json({ ok: true, mode: 'request', request_id: reqRow.id })
})
