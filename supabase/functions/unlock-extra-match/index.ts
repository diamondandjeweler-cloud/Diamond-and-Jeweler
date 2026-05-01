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
  if (purErr) return json({ error: purErr.message }, 500)

  const apiKey = Deno.env.get('BILLPLZ_API_KEY')
  const collectionId = Deno.env.get('BILLPLZ_COLLECTION_ID')
  const site = Deno.env.get('SITE_URL') ?? 'https://diamondandjeweler.com'
  const billplzBase = Deno.env.get('BILLPLZ_BASE_URL') ?? 'https://www.billplz.com'
  const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/payment-webhook`

  let paymentUrl: string
  let billId: string

  if (!apiKey || !collectionId) {
    // Mock mode for dev/preview environments.
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
        name: auth.email,
        amount: Math.round(priceRm * 100), // Billplz expects cents
        callback_url: webhookUrl,
        redirect_url: `${site}/payment/return?purchase=${purchase.id}`,
        reference_1_label: 'Purchase ID',
        reference_1: purchase.id,
      }),
    })
    if (!billplzRes.ok) {
      const errText = await billplzRes.text()
      return json({ error: `Billplz createBill failed: ${billplzRes.status} — ${errText}` }, 502)
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
    console.error('Failed to link bill ID to purchase', purchase.id, linkErr)
    return json({ error: `Bill link failed: ${linkErr.message}` }, 500)
  }

  return new Response(
    JSON.stringify({ purchase_id: purchase.id, bill_id: billId, paymentUrl, amount_rm: priceRm }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
