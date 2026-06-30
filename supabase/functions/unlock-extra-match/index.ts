/**
 * unlock-extra-match
 *
 * Starts a Billplz checkout for one extra match. Creates a pending
 * extra_match_purchases row, returns a Billplz payment URL.
 * The actual match is only inserted after payment-webhook confirms paid=true.
 *
 * Billplz credentials (Edge Function secrets):
 *   BILLPLZ_API_KEY        — Billplz API key (Basic auth username)
 *   BILLPLZ_COLLECTION_ID  — Billplz collection ID
 *   BILLPLZ_BASE_URL       — default https://www.billplz.com
 *   SITE_URL               — used for redirect/callback URLs
 *
 * If BILLPLZ_API_KEY is unset the function still works but returns a mock
 * payment URL (useful for local/preview envs and webhook testing).
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'
import { enforceRateLimit, RateLimitError } from '../_shared/ratelimit.ts'
import { withIdempotency } from '../_shared/idempotency.ts'
import { reportError } from '../_shared/observe.ts'
import { createLogger } from '../_shared/logger.ts'

const log = createLogger('unlock-extra-match')

interface Body {
  match_type: 'hm_extra' | 'talent_extra'
  role_id?: string
  talent_id?: string
}

// Wrapped so any uncaught throw in the handler is reported to the edge error
// sink before propagating. Re-throws unchanged — status/response/control flow
// are byte-for-byte identical to the bare handler (purely additive telemetry).
serve(async (req) => {
  try {
    return await handler(req)
  } catch (e) {
    await reportError(e, { fn: 'unlock-extra-match' })
    throw e
  }
})

async function handler(req: Request): Promise<Response> {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, {
    requiredRoles: ['talent', 'hiring_manager', 'admin'],
  })
  if (auth instanceof Response) return auth

  let body: Body
  try { body = (await req.json()) as Body }
  catch { return json({ error: 'Invalid JSON' }, 400) }
  if (body.match_type !== 'hm_extra' && body.match_type !== 'talent_extra') {
    return json({ error: 'match_type must be hm_extra or talent_extra' }, 400)
  }

  // Cross-role guard: talent callers may never request hm_extra purchases and
  // HM callers may never request talent_extra purchases.
  if (body.match_type === 'hm_extra' && auth.role === 'talent') {
    return json({ error: 'Forbidden: talent cannot purchase hm_extra matches' }, 403)
  }
  if (body.match_type === 'talent_extra' && auth.role === 'hiring_manager') {
    return json({ error: 'Forbidden: hiring_manager cannot purchase talent_extra matches' }, 403)
  }

  // Per-user rate limit (20 req/hour) before any DB write or Billplz bill creation.
  try {
    await enforceRateLimit(adminClient(), 'unlock-extra-match:' + auth.userId, 20, 3600)
  } catch (e) {
    if (e instanceof RateLimitError) return json({ error: 'rate_limited' }, 429)
    throw e
  }

  const db = adminClient()

  // Request-level idempotency: a client-supplied Idempotency-Key de-dupes the
  // ownership-check + pending-purchase insert + Billplz bill-creation body below,
  // so a double-click does not create two pending purchases + two bills. The
  // webhook's own CAS guards remain authoritative against a double match-grant.
  const idemKey = req.headers.get('Idempotency-Key')
  const result = await withIdempotency(db, idemKey, auth.userId, 'unlock-extra-match', async () => {
    // Resolve target + ownership + current quota.
    let roleId: string | null = null
    let talentId: string | null = null
    let used = 0
    const cap = 3

    if (body.match_type === 'hm_extra') {
      if (!body.role_id) return { _status: 400, _body: { error: 'role_id required for hm_extra' } }
      const { data: role } = await db.from('roles')
        .select('id, hiring_manager_id, extra_matches_used, status')
        .eq('id', body.role_id).maybeSingle()
      if (!role) return { _status: 404, _body: { error: 'Role not found' } }
      if (role.status !== 'active') return { _status: 400, _body: { error: `Role is ${role.status}` } }

      if (auth.role === 'hiring_manager' && !auth.isServiceRole) {
        const { data: hm } = await db.from('hiring_managers')
          .select('id').eq('id', role.hiring_manager_id).eq('profile_id', auth.userId)
          .maybeSingle()
        if (!hm) return { _status: 403, _body: { error: 'Not the role owner' } }
      }
      roleId = role.id
      used = role.extra_matches_used ?? 0
    } else {
      let tid = body.talent_id ?? null
      if (!tid) {
        const { data: t } = await db.from('talents').select('id')
          .eq('profile_id', auth.userId).maybeSingle()
        tid = t?.id ?? null
      }
      if (!tid) return { _status: 404, _body: { error: 'Talent profile not found' } }

      const { data: talent } = await db.from('talents')
        .select('id, profile_id, extra_matches_used').eq('id', tid).maybeSingle()
      if (!talent) return { _status: 404, _body: { error: 'Talent not found' } }
      if (auth.role === 'talent' && !auth.isServiceRole && talent.profile_id !== auth.userId) {
        return { _status: 403, _body: { error: 'Cannot purchase for another talent' } }
      }
      talentId = talent.id
      used = talent.extra_matches_used ?? 0
    }

    if (used >= cap) {
      return { _status: 400, _body: { error: 'Extra match quota exhausted', used, cap } }
    }

    // Price — read from system_config, fallback to 9.90.
    const { data: priceCfg } = await db.from('system_config').select('value')
      .eq('key', 'extra_match_price_rm').maybeSingle()
    const priceRm = typeof priceCfg?.value === 'number' ? priceCfg.value : 9.90

    // Create pending purchase row FIRST so the webhook has something to reconcile.
    const { data: purchase, error: purErr } = await db
      .from('extra_match_purchases')
      .insert({
        user_id: auth.userId,
        role_id: roleId,
        talent_id: talentId,
        match_type: body.match_type,
        quantity: 1,
        amount_rm: priceRm,
        currency: 'RM',
        payment_status: 'pending',
        payment_provider: 'billplz',
      })
      .select('id')
      .single()
    if (purErr) return { _status: 500, _body: { error: purErr.message } }

    // Resolve full_name for the Billplz bill customer field.
    const { data: profileRow } = await db.from('profiles').select('full_name')
      .eq('id', auth.userId).maybeSingle()
    const customerName = profileRow?.full_name?.trim() || auth.email

    const apiKey = Deno.env.get('BILLPLZ_API_KEY')
    const collectionId = Deno.env.get('BILLPLZ_COLLECTION_ID')
    const site = Deno.env.get('SITE_URL') ?? 'https://diamondandjeweler.com'
    const billplzBase = Deno.env.get('BILLPLZ_BASE_URL') ?? 'https://www.billplz.com'
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/payment-webhook`

    // Safety guard: test accounts (@dnj-test.my) must never be routed to the
    // production Billplz domain. If the project secrets still point at prod
    // (billplz.com, not billplz-sandbox.com), force mock mode for testers so a
    // QA click on "Buy" cannot charge a real bank account.
    const isTestEmail = typeof auth.email === 'string' && auth.email.toLowerCase().endsWith('@dnj-test.my')
    const isProdBillplz = /^https?:\/\/(www\.)?billplz\.com/i.test(billplzBase)
    const forceMockForTester = isTestEmail && isProdBillplz

    let paymentUrl: string
    let billId: string

    if (!apiKey || !collectionId || forceMockForTester) {
      // Mock mode for dev/preview environments + safety guard for test accounts.
      billId = `MOCK-${purchase.id}`
      paymentUrl = `${site}/payment/mock?purchase=${purchase.id}`
    } else {
      const credentials = btoa(`${apiKey}:`)
      const billplzRes = await fetch(`${billplzBase}/api/v3/bills`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          collection_id: collectionId,
          description: `DNJ extra match (${body.match_type})`,
          email: auth.email,
          name: customerName,
          amount: Math.round(priceRm * 100), // Billplz expects cents
          callback_url: webhookUrl,
          redirect_url: `${site}/payment/return?purchase=${purchase.id}`,
          reference_1_label: 'Purchase ID',
          reference_1: purchase.id,
        }),
      })
      if (!billplzRes.ok) {
        const errText = await billplzRes.text()
        return { _status: 502, _body: { error: `Billplz createBill failed: ${billplzRes.status} — ${errText}` } }
      }
      const bill = await billplzRes.json() as { id: string; url: string }
      billId = bill.id
      paymentUrl = bill.url
    }

    // Store the Billplz bill ID so the webhook can reconcile by it.
    const { error: linkErr } = await db.from('extra_match_purchases')
      .update({ payment_intent_id: billId })
      .eq('id', purchase.id)
    if (linkErr) {
      log.error('Failed to link bill ID to purchase', purchase.id, linkErr)
      return { _status: 500, _body: { error: `Bill link failed: ${linkErr.message}` } }
    }

    return {
      _status: 200,
      _body: { purchase_id: purchase.id, bill_id: billId, paymentUrl, amount_rm: priceRm },
    }
  })

  return new Response(
    JSON.stringify(result._body),
    { status: result._status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}
