/**
 * FoodPanda Vendor API Webhook
 *
 * Setup (after getting vendor API access from FoodPanda Malaysia):
 *  1. In FoodPanda Vendor Portal → API & Webhooks
 *     register: https://www.diamondandjeweler.com/api/webhooks/foodpanda
 *  2. Copy the HMAC secret   → add to Vercel as FOODPANDA_SECRET
 *  3. Set FOODPANDA_BRANCH_ID to the restaurant.branch.id for this vendor
 *
 * FoodPanda signs payloads with HMAC-SHA256; signature is in X-Fp-Hmac-SHA256 header.
 * Only NEW_ORDER events are processed; status-update events are acknowledged and ignored.
 */

export const config = { runtime: 'edge' }

import { hmacSha256, insertDeliveryOrder } from './_lib'

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body = await request.text()

  // ── Signature verification ─────────────────────────────────────────────────
  const secret = process.env.FOODPANDA_SECRET
  if (secret) {
    const sig      = request.headers.get('X-Fp-Hmac-SHA256') ?? ''
    const expected = await hmacSha256(secret, body)
    if (sig !== expected) {
      console.error('[foodpanda-webhook] Invalid signature')
      return new Response('Unauthorized', { status: 401 })
    }
  }

  let payload: FoodPandaPayload
  try {
    payload = JSON.parse(body) as FoodPandaPayload
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  // ── Only process new order events ─────────────────────────────────────────
  const eventType = request.headers.get('X-Fp-Event-Type') ?? payload.event_type ?? ''
  if (eventType && !/(order\.placed|new_order|order_created)/i.test(eventType)) {
    return json({ received: true })
  }

  // ── Insert into restaurant schema ─────────────────────────────────────────
  const branchId = process.env.FOODPANDA_BRANCH_ID
  if (!branchId) {
    console.error('[foodpanda-webhook] FOODPANDA_BRANCH_ID not set')
    return json({ received: true })
  }

  try {
    const order = payload.order ?? payload
    const addr  = [order.delivery_address?.street, order.delivery_address?.city]
      .filter(Boolean).join(', ') || null

    await insertDeliveryOrder({
      platform:         'foodpanda',
      externalOrderId:  String(order.code ?? order.id ?? order.order_id),
      branchId,
      customerName:     order.customer?.name ?? order.customer_name ?? 'FoodPanda Customer',
      customerPhone:    order.customer?.phone_number ?? order.customer?.phone ?? null,
      deliveryAddress:  addr,
      deliveryFee:      parseFloat(String(order.delivery_fee ?? '0')),
      items: (order.order_items ?? order.items ?? []).map((i) => ({
        externalItemId: String(i.id ?? i.product_id),
        name:           i.name ?? i.product_name ?? '',
        quantity:       i.quantity,
        unitPrice:      parseFloat(String(i.unit_price ?? i.price ?? '0')),
        notes:          i.special_instructions ?? i.notes ?? null,
      })),
      totalAmount: parseFloat(String(order.total_value ?? order.total ?? '0')),
      notes:       `FoodPanda #${order.code ?? order.id}`,
    })
  } catch (e) {
    console.error('[foodpanda-webhook] insertDeliveryOrder failed:', e)
  }

  return json({ success: true })
}

const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

interface FoodPandaPayload {
  event_type?: string
  order?: FPOrder
  // FoodPanda sometimes sends the order at root level
  code?: string; id?: string; order_id?: string
  customer?: { name?: string; phone_number?: string; phone?: string }
  customer_name?: string
  delivery_address?: { street?: string; city?: string }
  delivery_fee?: string | number
  order_items?: FPItem[]; items?: FPItem[]
  total_value?: string | number; total?: string | number
}
interface FPOrder {
  code?: string; id?: string; order_id?: string
  customer?: { name?: string; phone_number?: string; phone?: string }
  customer_name?: string
  delivery_address?: { street?: string; city?: string }
  delivery_fee?: string | number
  order_items?: FPItem[]; items?: FPItem[]
  total_value?: string | number; total?: string | number
}
interface FPItem {
  id?: string; product_id?: string
  name?: string; product_name?: string
  quantity: number
  unit_price?: string | number; price?: string | number
  special_instructions?: string; notes?: string
}
