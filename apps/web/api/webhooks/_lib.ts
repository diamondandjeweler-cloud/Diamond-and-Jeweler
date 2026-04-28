/**
 * Shared utilities for delivery platform webhook handlers.
 *
 * Environment variables needed in Vercel (Settings → Environment Variables):
 *   SUPABASE_URL               — https://sfnrpbsdscikpmbhrzub.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  — service-role key (bypasses RLS)
 *   GRAB_SECRET                — HMAC signing secret from GrabFood Merchant Portal
 *   GRAB_MERCHANT_ID           — your GrabFood merchant ID
 *   GRAB_BRANCH_ID             — restaurant.branch.id for this merchant
 *   FOODPANDA_SECRET           — HMAC secret from FoodPanda Vendor Portal
 *   FOODPANDA_BRANCH_ID        — restaurant.branch.id for this vendor
 *   SHOPEE_SECRET              — partner key from Shopee Food Partner Portal
 *   SHOPEE_BRANCH_ID           — restaurant.branch.id for this partner
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://sfnrpbsdscikpmbhrzub.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

/** Service-role Supabase client — bypasses RLS. Server-side only. */
function adminDb() {
  const client = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client.schema('restaurant' as never) as unknown as ReturnType<typeof client.schema> as any
}

/* ── HMAC helpers (Web Crypto, edge-compatible) ── */

async function hmacHex(algorithm: 'SHA-256' | 'SHA-512', secret: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: algorithm }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const hmacSha256 = (secret: string, data: string) => hmacHex('SHA-256', secret, data)
export const hmacSha512 = (secret: string, data: string) => hmacHex('SHA-512', secret, data)

/* ── Canonical order shape that all platform parsers produce ── */

export interface DeliveryOrder {
  platform: 'grab' | 'foodpanda' | 'shopee'
  externalOrderId: string
  branchId: string
  customerName: string
  customerPhone: string | null
  deliveryAddress: string | null
  deliveryFee: number
  items: Array<{
    externalItemId: string
    name: string
    quantity: number
    unitPrice: number   // MYR
    notes: string | null
  }>
  totalAmount: number
  notes: string | null
}

/* ── Insert a delivery order into the restaurant schema ── */

export async function insertDeliveryOrder(order: DeliveryOrder): Promise<string> {
  const db = adminDb()

  // 1. Load active menu items for the branch
  const { data: menuItems, error: miErr } = await db
    .from('menu_item')
    .select('id, name, price, course_type, station, platform_ids')
    .eq('branch_id', order.branchId)
    .eq('is_active', true)
  if (miErr) throw miErr

  // Resolve external item ID → menu_item row (platform ID match first, then name fallback)
  const resolve = (extId: string, name: string) => {
    const byId = (menuItems ?? []).find(
      (m: { platform_ids: Record<string, string> }) => m.platform_ids?.[order.platform] === extId,
    )
    if (byId) return byId
    return (menuItems ?? []).find(
      (m: { name: string }) => m.name.toLowerCase().trim() === name.toLowerCase().trim(),
    ) ?? null
  }

  // 2. Compute totals
  const subtotal  = order.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const tax       = Math.round(subtotal * 0.06 * 100) / 100
  const total     = Math.round((subtotal + tax + order.deliveryFee) * 100) / 100

  // 3. Insert order (idempotent — unique index on external_order_id prevents duplicate)
  const { data: newOrder, error: oErr } = await db
    .from('orders')
    .insert({
      branch_id:         order.branchId,
      table_id:          null,
      order_type:        'delivery',
      source:            order.platform,
      external_order_id: order.externalOrderId,
      customer_name:     order.customerName,
      customer_phone:    order.customerPhone,
      delivery_address:  order.deliveryAddress,
      delivery_fee:      order.deliveryFee,
      notes:             order.notes,
      status:            'active',
      subtotal,
      discount: 0,
      tax,
      tip: 0,
      total,
    })
    .select('id')
    .single()
  if (oErr) {
    // Unique constraint violation = already processed (platform retry) — safe to ack
    if (oErr.code === '23505') return 'duplicate'
    throw oErr
  }

  const orderId = (newOrder as { id: string }).id

  // 4. Insert order items + kitchen tickets
  for (const line of order.items) {
    const mi = resolve(line.externalItemId, line.name)

    const { data: oi, error: oiErr } = await db
      .from('order_item')
      .insert({
        order_id:            orderId,
        menu_item_id:        mi?.id ?? null,
        quantity:            line.quantity,
        unit_price:          line.unitPrice,
        modifier_ids:        [],
        modifiers_total:     0,
        special_instruction: line.notes,
        course_type:         (mi as { course_type?: string } | null)?.course_type ?? 'main',
        status:              'pending',
      })
      .select('id')
      .single()
    if (oiErr) throw oiErr

    const station = (mi as { station?: string | null } | null)?.station ?? 'kitchen'
    await db.from('kitchen_ticket').insert({
      branch_id:     order.branchId,
      order_id:      orderId,
      order_item_id: (oi as { id: string }).id,
      station,
      status:        'pending',
    })
  }

  return orderId
}
