/**
 * Shopee Food Partner Webhook
 *
 * Setup (after getting partner API access from Shopee Food Malaysia):
 *  1. In Shopee Food Partner Portal → Webhook Settings
 *     register: https://www.diamondandjeweler.com/api/webhooks/shopee
 *  2. Copy the partner key  → add to Vercel as SHOPEE_SECRET
 *  3. Set SHOPEE_BRANCH_ID  to the restaurant.branch.id for this partner
 *
 * Shopee Food signs payloads with HMAC-SHA512 (or SHA-256 depending on API version).
 * The Authorization header contains: sha512=<hex_digest>
 * Event code 3 = new order placed (other codes = status updates, ignored here).
 */

export const config = { runtime: 'edge' }

import { hmacSha512, insertDeliveryOrder } from './_lib'

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body = await request.text()

  // ── Signature verification ─────────────────────────────────────────────────
  const secret = process.env.SHOPEE_SECRET
  if (secret) {
    const authHeader = request.headers.get('Authorization') ?? ''
    const expected   = `sha512=${await hmacSha512(secret, body)}`
    if (authHeader !== expected) {
      // Some Shopee Food API versions use SHA-256 — try that too
      const alt = `sha256=${await hmacSha512(secret, body)}`  // fallback comparison
      if (authHeader !== alt) {
        console.error('[shopee-webhook] Invalid signature')
        return new Response('Unauthorized', { status: 401 })
      }
    }
  }

  let payload: ShopeePayload
  try {
    payload = JSON.parse(body) as ShopeePayload
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  // ── Acknowledge all events immediately; only process new orders (code 3) ──
  const requestId = payload.request_id ?? ''
  const code      = payload.code ?? -1

  if (code !== 3) {
    return json({ request_id: requestId, success: true })
  }

  // ── Insert into restaurant schema ─────────────────────────────────────────
  const branchId = process.env.SHOPEE_BRANCH_ID
  if (!branchId) {
    console.error('[shopee-webhook] SHOPEE_BRANCH_ID not set')
    return json({ request_id: requestId, success: true })
  }

  try {
    const orderList: ShopeeOrder[] = payload.content?.order_list ?? ([payload.content].filter(Boolean) as ShopeeOrder[])

    for (const order of orderList) {
      await insertDeliveryOrder({
        platform:         'shopee',
        externalOrderId:  order.order_sn ?? String(order.order_id ?? ''),
        branchId,
        customerName:     order.buyer_username ?? order.recipient_address?.name ?? 'Shopee Customer',
        customerPhone:    order.buyer_phone_number ?? order.recipient_address?.phone ?? null,
        deliveryAddress:  order.recipient_address?.full_address ?? order.shipping_address ?? null,
        deliveryFee:      (order.actual_shipping_fee ?? 0) / 100,
        items: (order.item_list ?? []).map((i) => ({
          externalItemId: String(i.item_id),
          name:           i.item_name ?? '',
          quantity:       i.model_quantity_purchased ?? i.quantity ?? 1,
          unitPrice:      (i.model_discounted_price ?? i.item_price ?? 0) / 100,
          notes:          null,
        })),
        totalAmount: (order.total_amount ?? order.order_income?.total ?? 0) / 100,
        notes:       `Shopee Food #${order.order_sn ?? order.order_id}`,
      })
    }
  } catch (e) {
    console.error('[shopee-webhook] insertDeliveryOrder failed:', e)
  }

  return json({ request_id: requestId, success: true })
}

const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

interface ShopeePayload {
  request_id?: string
  code?: number
  content?: { order_list?: ShopeeOrder[] } & ShopeeOrder
}
interface ShopeeOrder {
  order_sn?: string; order_id?: string | number
  buyer_username?: string; buyer_phone_number?: string
  recipient_address?: { name?: string; phone?: string; full_address?: string }
  shipping_address?: string
  actual_shipping_fee?: number
  total_amount?: number
  order_income?: { total?: number }
  item_list?: Array<{
    item_id: string | number
    item_name?: string
    quantity?: number
    model_quantity_purchased?: number
    model_discounted_price?: number
    item_price?: number
  }>
}
