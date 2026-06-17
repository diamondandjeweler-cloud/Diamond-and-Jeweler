/**
 * admin-refund
 *
 * Marks an extra-match purchase or buy-points purchase as refunded. Calls
 * the Billplz refund API when BILLPLZ_API_KEY is set; otherwise records the
 * refund as a manual write-off (useful for sandbox / preview env where the
 * Billplz creds point at a sandbox collection).
 *
 * Auth: admin role JWT only (no service-role bypass).
 *
 * Request:
 *   POST { purchase_type: 'extra_match' | 'points', purchase_id: uuid, reason: string }
 *
 * Response: { refunded: boolean, billplz_status?: string }
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'
import { logAudit, extractIp } from '../_shared/audit.ts'

interface Body {
  purchase_type: 'extra_match' | 'points'
  purchase_id: string
  reason: string
}

const BILLPLZ_API_KEY  = Deno.env.get('BILLPLZ_API_KEY')  ?? ''
const BILLPLZ_BASE_URL = (Deno.env.get('BILLPLZ_BASE_URL') ?? 'https://www.billplz.com').replace(/\/$/, '')

async function billplzRefund(billId: string, reason: string): Promise<{ ok: boolean; status?: string; error?: string }> {
  if (!BILLPLZ_API_KEY) {
    return { ok: true, status: 'mock_refund' }
  }
  const auth = btoa(BILLPLZ_API_KEY + ':')
  const res = await fetch(`${BILLPLZ_BASE_URL}/api/v3/bills/${encodeURIComponent(billId)}/refund`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ description: reason.slice(0, 200) }).toString(),
  })
  if (!res.ok) {
    return { ok: false, error: `Billplz refund failed: ${res.status} ${await res.text()}` }
  }
  return { ok: true, status: 'refunded' }
}

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, {
    requiredRoles: ['admin'],
    allowServiceRole: false,
  })
  if (auth instanceof Response) return auth

  let body: Body
  try { body = (await req.json()) as Body }
  catch { return json({ error: 'Invalid JSON' }, 400) }

  if (body.purchase_type !== 'extra_match' && body.purchase_type !== 'points') {
    return json({ error: 'purchase_type must be extra_match or points' }, 400)
  }
  if (!body.purchase_id) return json({ error: 'purchase_id required' }, 400)
  const reason = (body.reason ?? '').trim()
  if (reason.length < 8) {
    return json({ error: 'reason must be at least 8 characters' }, 400)
  }

  const db = adminClient()
  const isPoints = body.purchase_type === 'points'
  const table = isPoints ? 'point_purchases' : 'extra_match_purchases'

  // point_purchases carries a `points` column (the credited amount); the
  // extra_match_purchases table does not, so only request it for points refunds.
  const selectCols = isPoints
    ? 'id, payment_intent_id, payment_status, user_id, points'
    : 'id, payment_intent_id, payment_status, user_id'

  const { data: purchase, error: lookupErr } = await db
    .from(table)
    .select(selectCols)
    .eq('id', body.purchase_id)
    .maybeSingle()
  if (lookupErr) return json({ error: 'Purchase lookup failed', detail: lookupErr.message }, 500)
  if (!purchase) return json({ error: 'Purchase not found' }, 404)
  if (purchase.payment_status === 'refunded') {
    return json({ refunded: true, billplz_status: 'already_refunded' })
  }
  if (purchase.payment_status !== 'paid') {
    return json({ error: `Purchase is ${purchase.payment_status} — only paid purchases can be refunded` }, 400)
  }

  const refund = await billplzRefund(purchase.payment_intent_id ?? '', reason)
  if (!refund.ok) return json({ error: refund.error ?? 'Refund failed' }, 502)

  const { error: updErr } = await db
    .from(table)
    .update({
      payment_status: 'refunded',
      refunded_at: new Date().toISOString(),
      refund_reason: reason.slice(0, 500),
      refunded_by: auth.userId,
    })
    .eq('id', body.purchase_id)
  if (updErr) {
    return json({
      error: 'Refund succeeded at Billplz but local update failed — investigate manually',
      detail: updErr.message,
      billplz_status: refund.status,
    }, 500)
  }

  // Claw back the Diamond Points credited at purchase time (mirrors the
  // award_points credit in payment-webhook tryPointPurchase). award_points
  // floors the balance at 0, and the idempotency_key makes retries safe.
  // Non-fatal: if this fails, the refund itself still stands.
  let pointsWarning: string | undefined
  if (isPoints) {
    const creditedPoints = (purchase as { points?: number }).points ?? 0

    // Cheap best-effort balance check so finance can review if the user has
    // already spent some of the refunded points (claw-back still proceeds).
    if (creditedPoints > 0) {
      const { data: prof } = await db
        .from('profiles')
        .select('points')
        .eq('id', purchase.user_id)
        .maybeSingle()
      const currentBalance = (prof as { points?: number } | null)?.points
      if (typeof currentBalance === 'number' && currentBalance < creditedPoints) {
        pointsWarning = `User balance (${currentBalance}) is below the refunded points (${creditedPoints}); some were already spent — clawback floored at 0, please review.`
      }
    }

    const { error: clawErr } = await db.rpc('award_points', {
      p_user_id: purchase.user_id,
      p_delta: -creditedPoints,
      p_reason: 'points_refund',
      p_reference: { purchase_id: purchase.id, refunded_by: auth.userId },
      p_idempotency_key: `refund:${purchase.id}`,
    })
    if (clawErr) console.error('points_refund: award_points clawback failed', purchase.id, clawErr)
  }

  await logAudit({
    actorId: auth.userId,
    actorRole: 'admin',
    subjectId: purchase.user_id,
    action: 'admin_action',
    resourceType: table,
    resourceId: purchase.id,
    ip: extractIp(req),
    ua: req.headers.get('user-agent') ?? '',
    metadata: {
      kind: 'refund',
      purchase_type: body.purchase_type,
      billplz_bill_id: purchase.payment_intent_id,
      billplz_status: refund.status,
      reason,
    },
  })

  return json({
    refunded: true,
    billplz_status: refund.status,
    ...(pointsWarning ? { warning: pointsWarning } : {}),
  })
})
