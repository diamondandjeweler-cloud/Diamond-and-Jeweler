/**
 * GrabFood Merchant Integration Webhook
 *
 * Setup (after getting merchant API access from GrabFood Malaysia):
 *  1. In GrabFood Merchant Portal → Integrations → Webhooks
 *     register: https://www.diamondandjeweler.com/api/webhooks/grab
 *  2. Copy the signing secret → add to Vercel as GRAB_SECRET
 *  3. Copy your merchant ID  → add to Vercel as GRAB_MERCHANT_ID
 *  4. Set GRAB_BRANCH_ID to the restaurant.branch.id for this merchant
 *
 * GrabFood signs payloads with HMAC-SHA256; signature is in X-GrabFood-Signature header.
 * We must respond 200 within 5 seconds — order is processed synchronously (fast enough for Supabase).
 */

export const config = { runtime: 'edge' }

import { hmacSha256, insertDeliveryOrder } from './_lib'

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body = await request.text()

  // ── Signature verification ─────────────────────────────────────────────────
  const secret = process.env.GRAB_SECRET
  if (secret) {
    const sig      = request.headers.get('X-GrabFood-Signature') ?? ''
    const expected = await hmacSha256(secret, body)
    if (sig !== expected) {
      console.error('[grab-webhook] Invalid signature')
      return new Response('Unauthorized', { status: 401 })
    }
  }

  let payload: GrabPayload
  try {
    payload = JSON.parse(body) as GrabPayload
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  // ── Only process new order events ─────────────────────────────────────────
  const eventType = request.headers.get('X-GrabFood-Event') ?? payload.eventType ?? ''
  if (eventType && !eventType.includes('ORDER_PLACED') && !eventType.includes('ORDER_CREATED')) {
    return json({ received: true })
  }

  // ── Insert into restaurant schema ─────────────────────────────────────────
  const branchId = process.env.GRAB_BRANCH_ID
  if (!branchId) {
    console.error('[grab-webhook] GRAB_BRANCH_ID not set')
    return json({ received: true })   // ack anyway — don't let platform retry indefinitely
  }

  try {
    await insertDeliveryOrder({
      platform:         'grab',
      externalOrderId:  payload.orderID ?? payload.id ?? '',
      branchId,
      customerName:     payload.customer?.firstName ?? payload.customer?.name ?? 'GrabFood Customer',
      customerPhone:    payload.customer?.phone ?? null,
      deliveryAddress:  payload.delivery?.deliveryAddress ?? null,
      deliveryFee:      cents(payload.delivery?.deliveryFee ?? 0),
      items: (payload.orderItems ?? payload.items ?? []).map((i) => ({
        externalItemId: String(i.itemID ?? i.id ?? ''),
        name:           i.itemName ?? i.name ?? '',
        quantity:       i.quantity,
        unitPrice:      cents(i.price),
        notes:          i.specialInstruction ?? null,
      })),
      totalAmount: cents(payload.payment?.amount ?? payload.totalPrice ?? 0),
      notes:       `GrabFood #${payload.orderID ?? payload.id}`,
    })
  } catch (e) {
    console.error('[grab-webhook] insertDeliveryOrder failed:', e)
    // Still ack 200 — we log the error; retry storms hurt kitchen more than a missed order
  }

  return json({ success: true })
}

// GrabFood sends prices in cents (integer)
const cents = (v: number) => Math.round(v) / 100

const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

interface GrabPayload {
  orderID?: string
  id?: string
  eventType?: string
  merchantID?: string
  orderItems?: Array<{ itemID?: string; id?: string; itemName?: string; name?: string; quantity: number; price: number; specialInstruction?: string }>
  items?: Array<{ itemID?: string; id?: string; itemName?: string; name?: string; quantity: number; price: number; specialInstruction?: string }>
  payment?: { status?: string; amount?: number }
  totalPrice?: number
  delivery?: { deliveryAddress?: string; deliveryFee?: number; estimatedPickupTime?: string }
  customer?: { firstName?: string; name?: string; phone?: string }
}
