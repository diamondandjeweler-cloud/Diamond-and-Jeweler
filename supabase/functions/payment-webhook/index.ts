/**
 * payment-webhook
 *
 * Billplz callback endpoint — called server-to-server by Billplz after a
 * bill is paid (or fails). Also handles consult_bookings payments.
 *
 * Billplz POSTs application/x-www-form-urlencoded with:
 *   id, paid_at, paid (true/false), amount, currency,
 *   collection_id, reference_1, reference_1_label,
 *   x_signature (HMAC-SHA256 of sorted params with API key).
 *
 * On payment success:
 *   1. Verify X-Signature to prevent spoofed callbacks.
 *   2. Flip extra_match_purchases.payment_status to 'paid' (idempotent).
 *   3. Increment the relevant extra_matches_used counter.
 *   4. Call match-generate with is_extra_match=true to insert the extra match.
 *
 * Idempotency: a replayed webhook for an already-paid purchase is a no-op.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const ct = req.headers.get('content-type') ?? ''
  let params: Record<string, string> = {}

  try {
    if (ct.includes('application/json')) {
      const b = await req.json() as Record<string, unknown>
      for (const [k, v] of Object.entries(b)) params[k] = String(v ?? '')
    } else {
      const form = await req.formData()
      for (const [k, v] of form.entries()) params[k] = String(v)
    }
  } catch {
    return new Response('Bad request', { status: 400, headers: corsHeaders })
  }

  // Verify Billplz X-Signature (skip in mock/dev mode when API key is absent).
  const apiKey = Deno.env.get('BILLPLZ_API_KEY')
  if (apiKey) {
    const sig = params['x_signature'] ?? ''
    const verified = await verifyBillplzSignature(params, sig, apiKey)
    if (!verified) {
      console.error('Invalid Billplz X-Signature')
      return new Response('Invalid signature', { status: 401, headers: corsHeaders })
    }
  }

  const billId = params['id'] ?? ''
  const paid = params['paid'] === 'true'
  const purchaseRef = params['reference_1'] ?? ''

  if (!billId && !purchaseRef) {
    return new Response('Missing bill id', { status: 400, headers: corsHeaders })
  }

  const db = adminClient()

  // Try consult_bookings first.
  if (await tryConsultBooking({ db, billId, purchaseRef, paid })) {
    return new Response('OK (consult)', { status: 200, headers: corsHeaders })
  }

  // Look up extra_match_purchases.
  let purchase: {
    id: string; user_id: string; role_id: string | null; talent_id: string | null;
    match_type: 'hm_extra' | 'talent_extra'; quantity: number; payment_status: string;
  } | null = null

  if (billId) {
    const { data } = await db.from('extra_match_purchases')
      .select('id, user_id, role_id, talent_id, match_type, quantity, payment_status')
      .eq('payment_intent_id', billId).maybeSingle()
    purchase = data as typeof purchase
  }
  if (!purchase && purchaseRef) {
    const { data } = await db.from('extra_match_purchases')
      .select('id, user_id, role_id, talent_id, match_type, quantity, payment_status')
      .eq('id', purchaseRef).maybeSingle()
    purchase = data as typeof purchase
  }
  if (!purchase) {
    return new Response('Purchase not found', { status: 404, headers: corsHeaders })
  }

  // Idempotency.
  if (purchase.payment_status === 'paid') {
    return new Response('OK (already paid)', { status: 200, headers: corsHeaders })
  }

  if (!paid) {
    await db.from('extra_match_purchases')
      .update({ payment_status: 'failed' })
      .eq('id', purchase.id)
    return new Response('OK (failed)', { status: 200, headers: corsHeaders })
  }

  // SUCCESS path — flip to paid (row-level guard prevents double-grant on replay).
  const { error: updErr } = await db.from('extra_match_purchases')
    .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', purchase.id)
    .eq('payment_status', 'pending')
  if (updErr) return new Response(updErr.message, { status: 500, headers: corsHeaders })

  // Increment quota counter.
  if (purchase.match_type === 'hm_extra' && purchase.role_id) {
    const { data: role } = await db.from('roles')
      .select('extra_matches_used').eq('id', purchase.role_id).maybeSingle()
    if (role) {
      await db.from('roles')
        .update({ extra_matches_used: (role.extra_matches_used ?? 0) + purchase.quantity })
        .eq('id', purchase.role_id)
    }
  } else if (purchase.match_type === 'talent_extra' && purchase.talent_id) {
    const { data: t } = await db.from('talents')
      .select('extra_matches_used').eq('id', purchase.talent_id).maybeSingle()
    if (t) {
      await db.from('talents')
        .update({ extra_matches_used: (t.extra_matches_used ?? 0) + purchase.quantity })
        .eq('id', purchase.talent_id)
    }
  }

  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  // Fire match-generate for HM-side extra matches.
  if (purchase.match_type === 'hm_extra' && purchase.role_id) {
    fetch(`${supabaseUrl}/functions/v1/match-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
      body: JSON.stringify({ role_id: purchase.role_id, is_extra_match: true }),
    }).catch(() => { /* best effort */ })
  }

  // Notify buyer.
  fetch(`${supabaseUrl}/functions/v1/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
    body: JSON.stringify({
      user_id: purchase.user_id,
      type: 'extra_match_paid',
      data: { purchase_id: purchase.id, match_type: purchase.match_type },
    }),
  }).catch(() => { /* best effort */ })

  return new Response('OK', { status: 200, headers: corsHeaders })
})

/**
 * Verify Billplz X-Signature.
 * Algorithm: sort all params (excluding x_signature) alphabetically,
 * concatenate as "key1|value1|key2|value2|...", then HMAC-SHA256 with the API key.
 */
async function verifyBillplzSignature(
  params: Record<string, string>,
  signature: string,
  apiKey: string,
): Promise<boolean> {
  const filtered = Object.entries(params)
    .filter(([k]) => k !== 'x_signature')
    .sort(([a], [b]) => a.localeCompare(b))
  const payload = filtered.map(([k, v]) => `${k}|${v}`).join('|')

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(apiKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const computed = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return computed === signature.toLowerCase()
}

/**
 * Handle consult-booking payment callbacks.
 * Returns true if the bill/ref matched a consult booking, false otherwise.
 */
async function tryConsultBooking(args: {
  db: ReturnType<typeof adminClient>
  billId: string
  purchaseRef: string
  paid: boolean
}): Promise<boolean> {
  const { db, billId, purchaseRef, paid } = args
  let booking: {
    id: string; profile_id: string; tier: string; duration_minutes: number;
    price_rm: number; status: string;
  } | null = null

  if (billId) {
    const { data } = await db.from('consult_bookings')
      .select('id, profile_id, tier, duration_minutes, price_rm, status')
      .eq('payment_ref', billId).maybeSingle()
    booking = data as typeof booking
  }
  if (!booking && purchaseRef) {
    const { data } = await db.from('consult_bookings')
      .select('id, profile_id, tier, duration_minutes, price_rm, status')
      .eq('id', purchaseRef).maybeSingle()
    booking = data as typeof booking
  }
  if (!booking) return false

  if (['paid', 'scheduled', 'completed'].includes(booking.status)) return true

  if (!paid) {
    await db.from('consult_bookings').update({ status: 'cancelled' }).eq('id', booking.id)
    return true
  }

  const { error: updErr } = await db.from('consult_bookings')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', booking.id)
    .eq('status', 'pending')
  if (updErr) { console.error('consult: paid flip failed', booking.id, updErr); return true }

  let videoUrl: string | null = null
  try {
    const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/create-meeting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({
        room_name: `bole-consult-${booking.id.slice(0, 8)}`,
        duration_minutes: booking.duration_minutes,
      }),
    })
    if (r.ok) {
      const j = await r.json() as { url?: string; meeting_url?: string }
      videoUrl = j.url ?? j.meeting_url ?? null
    }
  } catch (e) { console.error('consult: create-meeting failed', e) }

  if (videoUrl) {
    await db.from('consult_bookings')
      .update({ video_url: videoUrl, status: 'scheduled' })
      .eq('id', booking.id)
  }

  fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify({
      user_id: booking.profile_id,
      type: 'consult_paid',
      data: { booking_id: booking.id, video_url: videoUrl, tier: booking.tier, duration_minutes: booking.duration_minutes },
    }),
  }).catch(() => { /* best effort */ })

  return true
}
