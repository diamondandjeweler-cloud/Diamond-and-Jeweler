/**
 * unlock-extra-match
 *
 * Starts a ToyyibPay checkout for one extra match. Creates a pending
 * extra_match_purchases row, returns a payment URL. The actual match is only
 * inserted after payment-webhook confirms payment = paid.
 *
 * Caller roles:
 *   - hiring_manager → buys 1 extra candidate for one of their own roles.
 *   - talent         → buys 1 extra offer (talent_extra).
 *   - admin          → can issue either on behalf of anyone (for refunds/retries).
 *
 * Quota:
 *   - hm_extra:     ≤ 3 per role     (roles.extra_matches_used)
 *   - talent_extra: ≤ 3 per talent   (talents.extra_matches_used)
 *
 * Price is read from system_config.extra_match_price_rm.
 *
 * ToyyibPay credentials (Edge Function secrets):
 *   TOYYIBPAY_SECRET          — user secret key
 *   TOYYIBPAY_CATEGORY_CODE   — the category (ProductCategoryCode)
 *   TOYYIBPAY_BASE_URL        — default https://toyyibpay.com
 *   SITE_URL                  — used for return/callback URLs
 * If TOYYIBPAY_SECRET is unset the function still works but returns a mock
 * payment URL (useful for local/preview envs and webhook testing).
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

interface Body {
  match_type: 'hm_extra' | 'talent_extra'
  role_id?: string
  talent_id?: string
}

serve(async (req) => {
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

  const db = adminClient()

  // Resolve target + ownership + current quota.
  let roleId: string | null = null
  let talentId: string | null = null
  let used = 0
  const cap = 3

  if (body.match_type === 'hm_extra') {
    if (!body.role_id) return json({ error: 'role_id required for hm_extra' }, 400)
    const { data: role } = await db.from('roles')
      .select('id, hiring_manager_id, extra_matches_used, status')
      .eq('id', body.role_id).maybeSingle()
    if (!role) return json({ error: 'Role not found' }, 404)
    if (role.status !== 'active') return json({ error: `Role is ${role.status}` }, 400)

    if (auth.role === 'hiring_manager' && !auth.isServiceRole) {
      const { data: hm } = await db.from('hiring_managers')
        .select('id').eq('id', role.hiring_manager_id).eq('profile_id', auth.userId)
        .maybeSingle()
      if (!hm) return json({ error: 'Not the role owner' }, 403)
    }
    roleId = role.id
    used = role.extra_matches_used ?? 0
  } else {
    // talent_extra — buyer is always the talent themselves (admin override allowed).
    let tid = body.talent_id ?? null
    if (!tid) {
      const { data: t } = await db.from('talents').select('id')
        .eq('profile_id', auth.userId).maybeSingle()
      tid = t?.id ?? null
    }
    if (!tid) return json({ error: 'Talent profile not found' }, 404)

    const { data: talent } = await db.from('talents')
      .select('id, profile_id, extra_matches_used').eq('id', tid).maybeSingle()
    if (!talent) return json({ error: 'Talent not found' }, 404)
    if (auth.role === 'talent' && !auth.isServiceRole && talent.profile_id !== auth.userId) {
      return json({ error: 'Cannot purchase for another talent' }, 403)
    }
    talentId = talent.id
    used = talent.extra_matches_used ?? 0
  }

  if (used >= cap) {
    return json({ error: 'Extra match quota exhausted', used, cap }, 400)
  }

  // Price.
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
    })
    .select('id')
    .single()
  if (purErr) return json({ error: purErr.message }, 500)

  // Build the ToyyibPay bill. If creds are missing we return a mock URL so
  // local dev / preview envs can still exercise the flow.
  const secret = Deno.env.get('TOYYIBPAY_SECRET')
  const category = Deno.env.get('TOYYIBPAY_CATEGORY_CODE')
  const site = Deno.env.get('SITE_URL') ?? 'https://bole.my'
  const tbase = Deno.env.get('TOYYIBPAY_BASE_URL') ?? 'https://toyyibpay.com'
  const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/payment-webhook`

  let paymentUrl: string
  let billCode: string

  if (!secret || !category) {
    billCode = `MOCK-${purchase.id}`
    paymentUrl = `${site}/payment/mock?purchase=${purchase.id}`
  } else {
    const form = new URLSearchParams({
      userSecretKey: secret,
      categoryCode: category,
      billName: 'BoLe extra match',
      billDescription: `Extra match unlock (${body.match_type})`,
      billPriceSetting: '1',
      billPayorInfo: '1',
      billAmount: String(Math.round(priceRm * 100)), // ToyyibPay expects sen
      billReturnUrl: `${site}/payment/return?purchase=${purchase.id}`,
      billCallbackUrl: webhookUrl,
      billExternalReferenceNo: purchase.id,
      billTo: auth.email,
      billEmail: auth.email,
      billPhone: '',
    })
    const tbResp = await fetch(`${tbase}/index.php/api/createBill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
    if (!tbResp.ok) {
      return json({ error: `ToyyibPay createBill failed: ${tbResp.status}` }, 502)
    }
    const tbJson = await tbResp.json() as Array<{ BillCode?: string }>
    billCode = tbJson?.[0]?.BillCode ?? ''
    if (!billCode) return json({ error: 'ToyyibPay returned no BillCode' }, 502)
    paymentUrl = `${tbase}/${billCode}`
  }

  // Link the billcode back to the purchase for the webhook to look up.
  // If this fails the webhook can't reconcile by billcode (it has a fallback to
  // order_id == purchase.id via ToyyibPay's external_ref), but surface the error
  // so we can alert on it instead of silently orphaning the purchase.
  const { error: linkErr } = await db.from('extra_match_purchases')
    .update({ payment_intent_id: billCode })
    .eq('id', purchase.id)
  if (linkErr) {
    console.error('Failed to link billcode to purchase', purchase.id, linkErr)
    return json({ error: `Payment intent link failed: ${linkErr.message}` }, 500)
  }

  return new Response(
    JSON.stringify({ purchase_id: purchase.id, billcode: billCode, paymentUrl, amount_rm: priceRm }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
