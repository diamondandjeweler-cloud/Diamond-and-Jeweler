/**
 * payment-webhook
 *
 * ToyyibPay callback endpoint. Called server-to-server by ToyyibPay after a
 * bill is paid (or fails). Public — no Supabase auth — but we verify the
 * billcode against our own extra_match_purchases row before granting anything.
 *
 * ToyyibPay POSTs application/x-www-form-urlencoded with at minimum:
 *   billcode, refno, status (1=success, 2=pending, 3=failed), order_id,
 *   amount, billpaymentStatus.
 *
 * On payment success:
 *   1. Flip extra_match_purchases.payment_status to 'paid' (idempotent).
 *   2. Increment the relevant extra_matches_used counter.
 *   3. Call match-generate with is_extra_match=true to insert the extra match.
 *
 * Idempotency: a replayed webhook for an already-paid purchase is a no-op.
 * We DO NOT trust ToyyibPay's "amount" — we reconcile only on billcode.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  // ToyyibPay uses form-encoded; accept JSON too for manual retries.
  let billcode = ''
  let statusId = ''
  let externalRef = ''
  const ct = req.headers.get('content-type') ?? ''
  try {
    if (ct.includes('application/json')) {
      const b = await req.json() as Record<string, unknown>
      billcode = String(b.billcode ?? b.BillCode ?? '')
      statusId = String(b.status ?? b.status_id ?? '')
      externalRef = String(b.order_id ?? b.refno ?? '')
    } else {
      const form = await req.formData()
      billcode = String(form.get('billcode') ?? form.get('BillCode') ?? '')
      statusId = String(form.get('status') ?? form.get('status_id') ?? '')
      externalRef = String(form.get('order_id') ?? form.get('refno') ?? '')
    }
  } catch {
    return new Response('Bad request', { status: 400, headers: corsHeaders })
  }

  if (!billcode && !externalRef) {
    return new Response('Missing billcode', { status: 400, headers: corsHeaders })
  }

  const db = adminClient()

  // Try consult_bookings first (newer flow). If found, handle and return.
  if (await tryConsultBooking({ db, billcode, externalRef, statusId })) {
    return new Response('OK (consult)', { status: 200, headers: corsHeaders })
  }

  // Otherwise fall through to extra_match_purchases (existing flow).
  let purchase: {
    id: string; user_id: string; role_id: string | null; talent_id: string | null;
    match_type: 'hm_extra' | 'talent_extra'; quantity: number; payment_status: string;
  } | null = null

  if (billcode) {
    const { data } = await db.from('extra_match_purchases')
      .select('id, user_id, role_id, talent_id, match_type, quantity, payment_status')
      .eq('payment_intent_id', billcode).maybeSingle()
    purchase = data as typeof purchase
  }
  if (!purchase && externalRef) {
    const { data } = await db.from('extra_match_purchases')
      .select('id, user_id, role_id, talent_id, match_type, quantity, payment_status')
      .eq('id', externalRef).maybeSingle()
    purchase = data as typeof purchase
  }
  if (!purchase) {
    return new Response('Purchase not found', { status: 404, headers: corsHeaders })
  }

  // Idempotency: already-paid purchases return 200 with no side effects.
  if (purchase.payment_status === 'paid') {
    return new Response('OK (already paid)', { status: 200, headers: corsHeaders })
  }

  // Map ToyyibPay status → our enum.
  // 1 = success, 2 = pending, 3 = failed.
  if (statusId !== '1') {
    const next = statusId === '3' ? 'failed' : 'pending'
    await db.from('extra_match_purchases')
      .update({ payment_status: next })
      .eq('id', purchase.id)
    return new Response(`OK (status=${next})`, { status: 200, headers: corsHeaders })
  }

  // SUCCESS path. Flip to paid and grant the entitlement.
  const { error: updErr } = await db.from('extra_match_purchases')
    .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', purchase.id)
    .eq('payment_status', 'pending') // guard against double-grant on replay
  if (updErr) return new Response(updErr.message, { status: 500, headers: corsHeaders })

  // Increment the quota counter. CHECK constraint caps at 3.
  // Errors here are logged but don't unwind the 'paid' flip — ToyyibPay sent
  // us a valid success callback, the payment is real, and we'd rather owe
  // someone a manual quota bump than refuse the callback and leave them in
  // purgatory. An admin can reconcile via extra_match_purchases queries.
  if (purchase.match_type === 'hm_extra' && purchase.role_id) {
    const { data: role, error: rErr } = await db.from('roles')
      .select('extra_matches_used').eq('id', purchase.role_id).maybeSingle()
    if (rErr || !role) {
      console.error('hm_extra: role fetch failed', purchase.id, rErr)
    } else {
      const { error: uErr } = await db.from('roles')
        .update({ extra_matches_used: (role.extra_matches_used ?? 0) + purchase.quantity })
        .eq('id', purchase.role_id)
      if (uErr) console.error('hm_extra: quota update failed', purchase.id, uErr)
    }
  } else if (purchase.match_type === 'talent_extra' && purchase.talent_id) {
    const { data: t, error: tErr } = await db.from('talents')
      .select('extra_matches_used').eq('id', purchase.talent_id).maybeSingle()
    if (tErr || !t) {
      console.error('talent_extra: talent fetch failed', purchase.id, tErr)
    } else {
      const { error: uErr } = await db.from('talents')
        .update({ extra_matches_used: (t.extra_matches_used ?? 0) + purchase.quantity })
        .eq('id', purchase.talent_id)
      if (uErr) console.error('talent_extra: quota update failed', purchase.id, uErr)
    }
  }

  // Fire match-generate (HM-side only — talent-side extra match has no role_id
  // target, so the scoring engine can't action it; it just increases the cap
  // for future free-quota matches to queue through).
  if (purchase.match_type === 'hm_extra' && purchase.role_id) {
    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/match-generate`
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
      body: JSON.stringify({ role_id: purchase.role_id, is_extra_match: true }),
    }).catch(() => { /* best effort — admin can retry via the panel */ })
  }

  // Notify buyer via the existing notify function.
  const notifyUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/notify`
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  fetch(notifyUrl, {
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
 * Handle consult-booking payment callbacks. Returns true if the billcode/ref
 * matched a consult booking (paid or otherwise), false if it didn't and the
 * caller should fall through to extra_match_purchases.
 */
async function tryConsultBooking(args: {
  db: ReturnType<typeof adminClient>
  billcode: string
  externalRef: string
  statusId: string
}): Promise<boolean> {
  const { db, billcode, externalRef, statusId } = args
  let booking: {
    id: string; profile_id: string; tier: string; duration_minutes: number;
    price_rm: number; status: string;
  } | null = null
  if (billcode) {
    const { data } = await db.from('consult_bookings')
      .select('id, profile_id, tier, duration_minutes, price_rm, status')
      .eq('payment_ref', billcode).maybeSingle()
    booking = data as typeof booking
  }
  if (!booking && externalRef) {
    const { data } = await db.from('consult_bookings')
      .select('id, profile_id, tier, duration_minutes, price_rm, status')
      .eq('id', externalRef).maybeSingle()
    booking = data as typeof booking
  }
  if (!booking) return false

  // Idempotency.
  if (booking.status === 'paid' || booking.status === 'scheduled' || booking.status === 'completed') {
    return true
  }

  if (statusId !== '1') {
    const next = statusId === '3' ? 'cancelled' : 'pending'
    await db.from('consult_bookings').update({ status: next }).eq('id', booking.id)
    return true
  }

  // Success: flip to paid.
  const { error: updErr } = await db.from('consult_bookings')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', booking.id)
    .eq('status', 'pending')
  if (updErr) {
    console.error('consult: paid flip failed', booking.id, updErr)
    return true
  }

  // Generate the video meeting link via the existing create-meeting Edge Function.
  let videoUrl: string | null = null
  try {
    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/create-meeting`
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
      body: JSON.stringify({
        room_name: `bole-consult-${booking.id.slice(0, 8)}`,
        duration_minutes: booking.duration_minutes,
      }),
    })
    if (r.ok) {
      const j = await r.json() as { url?: string; meeting_url?: string }
      videoUrl = j.url ?? j.meeting_url ?? null
    }
  } catch (e) {
    console.error('consult: create-meeting failed', e)
  }

  if (videoUrl) {
    await db.from('consult_bookings')
      .update({ video_url: videoUrl, status: 'scheduled' })
      .eq('id', booking.id)
  }

  // Notify the user with the video link.
  try {
    const notifyUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/notify`
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    fetch(notifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
      body: JSON.stringify({
        user_id: booking.profile_id,
        type: 'consult_paid',
        data: {
          booking_id: booking.id,
          video_url: videoUrl,
          tier: booking.tier,
          duration_minutes: booking.duration_minutes,
        },
      }),
    }).catch(() => { /* best effort */ })
  } catch { /* best effort */ }

  return true
}
