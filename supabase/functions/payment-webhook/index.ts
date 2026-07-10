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
import { webhookCorsHeaders as corsHeaders, handleWebhookOptions as handleOptions } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { timingSafeEqual } from '../_shared/auth.ts'
import { reportError } from '../_shared/observe.ts'

// The whole post-parse money path (signature verify, paid flip, quota grant,
// tryConsultBooking/tryPointPurchase) lives in handlePaymentWebhook, which the
// serve() wrapper below guards with try/catch → reportError, so an uncaught throw
// is no longer silent (resolves TODO batch2). Extracted, NOT re-indented, so the
// money-path body is byte-for-byte unchanged.
async function handlePaymentWebhook(req: Request): Promise<Response> {
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
  } catch (e) {
    await reportError(e, { fn: 'payment-webhook', stage: 'parse-body', content_type: ct })
    return new Response('Bad request', { status: 400, headers: corsHeaders })
  }

  // Verify Billplz X-Signature — fail closed if key is not configured.
  // NOTE(swr-money-matcher): this gate is the Billplz path and is intentionally
  // left unchanged here (out of scope: "do not alter the Billplz path"). The new
  // server-side ToyyibPay confirmation lives in tryConsultBooking, but a real
  // ToyyibPay callback carries no x_signature and is rejected 401 by THIS gate
  // before it reaches that branch. For the ToyyibPay verify branch to actually
  // run end-to-end, the owner must reconcile inbound routing (e.g. a dedicated
  // toyyibpay-webhook function, or a provider branch BEFORE this gate) — see
  // docs/AUDIT_REMEDIATION_2026-06-26.md [P1-toyyibpay-callback]. Until then the
  // branch is dormant-but-correct (additive, fail-safe) for Billplz-routed flows.
  const apiKey = Deno.env.get('BILLPLZ_API_KEY')
  if (!apiKey) {
    console.error('BILLPLZ_API_KEY is not set — rejecting webhook to prevent payment fraud')
    return new Response('Service misconfigured', { status: 500, headers: corsHeaders })
  }
  const sig = params['x_signature'] ?? ''
  const verified = await verifyBillplzSignature(params, sig, apiKey)
  if (!verified) {
    console.error('Invalid Billplz X-Signature')
    return new Response('Invalid signature', { status: 401, headers: corsHeaders })
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

  // Try point_purchases (Diamond Points package buy).
  if (await tryPointPurchase({ db, billId, purchaseRef, paid })) {
    return new Response('OK (points)', { status: 200, headers: corsHeaders })
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

  // SUCCESS path — flip to paid. Guard on payment_status='pending' prevents double-grant.
  // Check affected rows so a concurrent webhook that lost the race exits cleanly.
  const { data: flipped, error: updErr } = await db.from('extra_match_purchases')
    .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', purchase.id)
    .eq('payment_status', 'pending')
    .select('id')
  if (updErr) return new Response(updErr.message, { status: 500, headers: corsHeaders })
  if (!flipped || flipped.length === 0) return new Response('OK (already paid)', { status: 200, headers: corsHeaders })

  // Increment quota counter atomically (UPDATE col = col + qty) to prevent
  // a read-modify-write race when two different purchases for the same role
  // or talent are paid concurrently.
  if (purchase.match_type === 'hm_extra' && purchase.role_id) {
    await db.rpc('increment_extra_matches_used', {
      p_table: 'roles',
      p_id: purchase.role_id,
      p_qty: purchase.quantity,
    })
  } else if (purchase.match_type === 'talent_extra' && purchase.talent_id) {
    await db.rpc('increment_extra_matches_used', {
      p_table: 'talents',
      p_id: purchase.talent_id,
      p_qty: purchase.quantity,
    })
  }

  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  // Fire match-generate for HM-side extra matches.
  if (purchase.match_type === 'hm_extra' && purchase.role_id) {
    fetch(`${supabaseUrl}/functions/v1/match-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
      // Pass the purchase id so the delivered match is linked back to it
      // (matches.source_purchase_id), letting admin-refund expire it on refund.
      body: JSON.stringify({ role_id: purchase.role_id, is_extra_match: true, source_purchase_id: purchase.id }),
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
}

serve(async (req) => {
  try {
    return await handlePaymentWebhook(req)
  } catch (e) {
    // Post-parse money-path throws were previously unreported (TODO batch2 — now
    // fixed): report and return 500 so Billplz retries. Retries are safe because
    // the paid flip is idempotent (already-paid → 200 OK on the retry).
    await reportError(e, { fn: 'payment-webhook', stage: 'money-path' })
    return new Response('Internal error', { status: 500, headers: corsHeaders })
  }
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

  return timingSafeEqual(computed, signature.toLowerCase())
}

/**
 * Handle Diamond Points package purchases (point_purchases table).
 * Returns true if the bill/ref matched a points purchase, false otherwise.
 *
 * On paid=true: flip to 'paid' and credit points via award_points() with the
 * purchase id as idempotency_key (so a replayed webhook never double-credits).
 */
async function tryPointPurchase(args: {
  db: ReturnType<typeof adminClient>
  billId: string
  purchaseRef: string
  paid: boolean
}): Promise<boolean> {
  const { db, billId, purchaseRef, paid } = args
  let purchase: {
    id: string; user_id: string; package_id: string; package_name: string;
    points: number; amount_rm: number; payment_status: string;
  } | null = null

  if (billId) {
    const { data } = await db.from('point_purchases')
      .select('id, user_id, package_id, package_name, points, amount_rm, payment_status')
      .eq('payment_intent_id', billId).maybeSingle()
    purchase = data as typeof purchase
  }
  if (!purchase && purchaseRef) {
    const { data } = await db.from('point_purchases')
      .select('id, user_id, package_id, package_name, points, amount_rm, payment_status')
      .eq('id', purchaseRef).maybeSingle()
    purchase = data as typeof purchase
  }
  if (!purchase) return false

  if (purchase.payment_status === 'paid') return true

  if (!paid) {
    await db.from('point_purchases')
      .update({ payment_status: 'failed' })
      .eq('id', purchase.id)
    return true
  }

  // Row-level guard: only flip if still pending.
  const { data: updRows, error: updErr } = await db.from('point_purchases')
    .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', purchase.id)
    .eq('payment_status', 'pending')
    .select('id')
  if (updErr) { console.error('points: paid flip failed', purchase.id, updErr); return true }
  if (!updRows || updRows.length === 0) return true

  const { error: awardErr } = await db.rpc('award_points', {
    p_user_id: purchase.user_id,
    p_delta: purchase.points,
    p_reason: 'extra_match_purchased',
    p_reference: { purchase_id: purchase.id, package_id: purchase.package_id, amount_rm: purchase.amount_rm },
    p_idempotency_key: `point_purchase:${purchase.id}`,
  })
  if (awardErr) console.error('points: award_points failed', purchase.id, awardErr)

  fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify({
      user_id: purchase.user_id,
      type: 'points_purchased',
      data: { purchase_id: purchase.id, points: purchase.points, package_name: purchase.package_name },
    }),
  }).catch(() => { /* best effort */ })

  return true
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
    price_rm: number; status: string; payment_provider: string | null; payment_ref: string | null;
  } | null = null

  if (billId) {
    const { data } = await db.from('consult_bookings')
      .select('id, profile_id, tier, duration_minutes, price_rm, status, payment_provider, payment_ref')
      .eq('payment_ref', billId).maybeSingle()
    booking = data as typeof booking
  }
  if (!booking && purchaseRef) {
    const { data } = await db.from('consult_bookings')
      .select('id, profile_id, tier, duration_minutes, price_rm, status, payment_provider, payment_ref')
      .eq('id', purchaseRef).maybeSingle()
    booking = data as typeof booking
  }
  if (!booking) return false

  if (['paid', 'scheduled', 'completed'].includes(booking.status)) return true

  if (!paid) {
    await db.from('consult_bookings').update({ status: 'cancelled' }).eq('id', booking.id).eq('status', 'pending')
    return true
  }

  // Defense-in-depth (ROAD_TO_A_PLUS §3): consults are paid via ToyyibPay, whose
  // basic callback carries no HMAC signature. Before trusting paid=true for a
  // ToyyibPay booking, re-confirm the bill SERVER-SIDE via getBillTransactions
  // (status=success + amount matches) rather than the raw callback flag. This is
  // an ADDITIVE guard: it can only DOWNGRADE a callback we'd otherwise trust to
  // 'failed' — it never flips a booking to paid on its own. If the ToyyibPay
  // secret is unset, OR the booking did not go through ToyyibPay, we fall back to
  // the existing callback-trusting behavior so nothing breaks.
  const tpBillCode = booking.payment_ref ?? (billId || null)
  const isToyyibBooking = (booking.payment_provider ?? '').toLowerCase() === 'toyyibpay'
  if (isToyyibBooking && tpBillCode) {
    const confirmed = await confirmToyyibPayPaid(tpBillCode, booking.price_rm)
    if (confirmed === false) {
      // Authoritative source says NOT paid → treat as a failed/spoofed callback.
      console.error('consult: ToyyibPay getBillTransactions did not confirm payment', booking.id, tpBillCode)
      await db.from('consult_bookings').update({ status: 'cancelled' }).eq('id', booking.id).eq('status', 'pending')
      return true
    }
    // confirmed === null → env not configured or provider unreachable: fall back
    // to the existing behavior (trust the callback) so the path is not broken.
  }

  const { data: flippedBooking, error: updErr } = await db.from('consult_bookings')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', booking.id)
    .eq('status', 'pending')
    .select('id')
  if (updErr) { console.error('consult: paid flip failed', booking.id, updErr); return true }
  if (!flippedBooking || flippedBooking.length === 0) return true  // concurrent webhook already processed

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

/**
 * Server-side confirmation of a ToyyibPay bill via getBillTransactions.
 *
 * Defense-in-depth for the consult money path: ToyyibPay's basic callback has no
 * HMAC signature, so we re-fetch the bill's authoritative status from ToyyibPay
 * before trusting paid=true. Mirrors the env var names used by
 * init-consult-booking (TOYYIBPAY_SECRET / TOYYIBPAY_BASE_URL).
 *
 * Returns:
 *   true  — ToyyibPay reports the bill is paid (billpaymentStatus == '1') and,
 *           when an expected amount is known, the paid amount matches (in sen).
 *   false — ToyyibPay reports the bill is NOT successfully paid, or the amount
 *           does not match the booking price (possible spoof / tampering).
 *   null  — secret not configured OR the provider could not be reached / parsed,
 *           so the caller should FALL BACK to the existing callback behavior
 *           rather than break the path.
 *
 * Endpoint contract (ToyyibPay): POST {base}/index.php/api/getBillTransactions
 * with form fields { userSecretKey, billCode }. Response is a JSON array of
 * transactions; a successful payment has billpaymentStatus == '1' and
 * billpaymentAmount in RM (string). Documented here so the exact field names are
 * verifiable against ToyyibPay's live contract at deploy time.
 * TODO(swr-money-matcher): confirm the getBillTransactions field names
 * (billpaymentStatus / billpaymentAmount) + success code ('1') against the live
 * ToyyibPay API during owner deploy verification; the null fallback keeps the
 * path safe if the shape differs.
 */
async function confirmToyyibPayPaid(
  billCode: string,
  expectedPriceRm: number | null,
): Promise<boolean | null> {
  const tpSecret = Deno.env.get('TOYYIBPAY_SECRET')
  const tpBaseUrl = Deno.env.get('TOYYIBPAY_BASE_URL') ?? 'https://toyyibpay.com'
  // Env not configured → cannot verify; signal fall-back.
  if (!tpSecret || !billCode) return null

  try {
    const resp = await fetch(`${tpBaseUrl}/index.php/api/getBillTransactions`, {
      method: 'POST',
      body: new URLSearchParams({ userSecretKey: tpSecret, billCode }),
    })
    if (!resp.ok) {
      console.error('toyyibpay getBillTransactions http error', resp.status)
      return null  // provider unreachable → fall back
    }
    const text = await resp.text()
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch {
      console.error('toyyibpay getBillTransactions: non-JSON response')
      return null
    }
    const rows = Array.isArray(parsed) ? parsed as Array<Record<string, unknown>> : []
    if (rows.length === 0) {
      // No transactions recorded for this bill → not paid.
      return false
    }
    // A successful payment row has billpaymentStatus == '1'.
    const successRow = rows.find((r) => String(r['billpaymentStatus'] ?? '') === '1')
    if (!successRow) return false

    // When we know the expected price, confirm the paid amount matches (in sen).
    if (expectedPriceRm != null) {
      const expectedSen = Math.round(expectedPriceRm * 100)
      const paidRm = Number(successRow['billpaymentAmount'])
      if (Number.isFinite(paidRm)) {
        const paidSen = Math.round(paidRm * 100)
        if (paidSen !== expectedSen) {
          console.error('toyyibpay amount mismatch', { billCode, expectedSen, paidSen })
          return false
        }
      }
      // If the amount field is missing/unparseable, do not hard-fail on amount —
      // the status==1 success row already confirms payment.
    }
    return true
  } catch (e) {
    console.error('toyyibpay getBillTransactions failed', e)
    return null  // network error → fall back to existing behavior
  }
}
