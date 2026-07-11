/**
 * Restaurant data access — ORDERS.
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { restaurantDb as db } from '../client'
import { TAX_RATE, taxOn } from '../pricing'
import { updateTableStatus } from './tables'
import type {
  Order, OrderItem, CartLine, OrderStatus, OrderItemStatus, TicketStatus,
} from '../types'

/**
 * Pure recompute of order money fields from its current line items + discount.
 * Mirrors the addItemToOrder/reorderToOpenOrder formula exactly. Voided items
 * are excluded from the subtotal. tip/delivery_fee are intentionally NOT
 * applied here — those are applied later at the cashier stage, consistent
 * with the add-item/reorder totals.
 */
export function recomputeOrderTotals(
  items: { quantity: number; unit_price: number | string; modifiers_total: number | string; status: string }[],
  discount: number,
): { subtotal: number; tax: number; total: number } {
  const subtotal = items
    .filter((it) => it.status !== 'voided')
    .reduce((s, it) => s + Number(it.quantity) * (Number(it.unit_price) + Number(it.modifiers_total)), 0)
  const tax = taxOn(subtotal - discount)
  const total = subtotal - discount + tax
  return { subtotal, tax, total }
}

/**
 * Add a single menu item to an existing open order. Inserts an order_item row,
 * creates a kitchen ticket, and bumps the order totals.
 */
export async function addItemToOrder(
  orderId: string,
  menuItemId: string,
  quantity: number,
  unitPrice: number,
  station: string,
  courseType: string,
): Promise<void> {
  const { data: order } = await db.from('orders').select('id, branch_id, subtotal, discount, tax, total').eq('id', orderId).single()
  if (!order) throw new Error('Order not found')
  const { data: oi, error: oiErr } = await db.from('order_item').insert({
    order_id: orderId, menu_item_id: menuItemId, quantity,
    unit_price: unitPrice, modifier_ids: [], modifiers_total: 0,
    course_type: courseType, status: 'fired',
  }).select('id').single()
  if (oiErr) throw oiErr
  await db.from('kitchen_ticket').insert({
    branch_id: order.branch_id, order_id: orderId,
    order_item_id: oi.id, station, status: 'pending',
  })
  // Bump totals
  const lineSubtotal = unitPrice * quantity
  const newSubtotal = Number(order.subtotal) + lineSubtotal
  const newTax = taxOn(newSubtotal - Number(order.discount))
  const newTotal = newSubtotal - Number(order.discount) + newTax
  await db.from('orders').update({
    subtotal: newSubtotal, tax: newTax, total: newTotal, status: 'sent',
  }).eq('id', orderId)
}

/**
 * Quick reorder: clone every non-voided line on the given order, insert as
 * fresh order_items + tickets, bump totals. Returns the count cloned.
 */
export async function reorderToOpenOrder(orderId: string, _employeeId: string | null): Promise<number> {
  const { data: order } = await db.from('orders').select('id, branch_id, subtotal, discount, tax, total').eq('id', orderId).single()
  if (!order) return 0
  const { data: existing } = await db.from('order_item')
    .select('menu_item_id, quantity, unit_price, modifier_ids, modifiers_total, course_type, special_instruction, status')
    .eq('order_id', orderId)
  const lines = (existing ?? []).filter((x) => x.status !== 'voided')
  if (lines.length === 0) return 0
  // Look up stations for each menu_item_id
  const ids = Array.from(new Set(lines.map((l) => l.menu_item_id)))
  const { data: mis } = await db.from('menu_item').select('id, station').in('id', ids)
  const stationOf = new Map(((mis ?? []) as Array<{ id: string; station: string | null }>).map((m) => [m.id, m.station ?? 'kitchen']))
  let lineSubtotal = 0
  for (const l of lines) {
    const { data: oi } = await db.from('order_item').insert({
      order_id: orderId, menu_item_id: l.menu_item_id, quantity: l.quantity,
      unit_price: l.unit_price, modifier_ids: l.modifier_ids, modifiers_total: l.modifiers_total,
      course_type: l.course_type, special_instruction: l.special_instruction,
      status: 'fired',
    }).select('id').single()
    if (oi) {
      await db.from('kitchen_ticket').insert({
        branch_id: order.branch_id, order_id: orderId,
        order_item_id: oi.id, station: stationOf.get(l.menu_item_id) ?? 'kitchen', status: 'pending',
      })
    }
    lineSubtotal += Number(l.unit_price) * Number(l.quantity) + Number(l.modifiers_total)
  }
  const newSubtotal = Number(order.subtotal) + lineSubtotal
  const newTax = taxOn(newSubtotal - Number(order.discount))
  const newTotal = newSubtotal - Number(order.discount) + newTax
  await db.from('orders').update({ subtotal: newSubtotal, tax: newTax, total: newTotal, status: 'sent' }).eq('id', orderId)
  return lines.length
}

export async function listActiveOrders(branchId: string): Promise<Order[]> {
  const { data, error } = await db
    .from('orders').select('*')
    .eq('branch_id', branchId)
    .in('status', ['active', 'sent', 'partial', 'ready', 'served'])
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Order[]
}

export async function listOrders(branchId: string, limit = 100): Promise<Order[]> {
  const { data, error } = await db
    .from('orders').select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Order[]
}

export async function getOrder(id: string): Promise<Order | null> {
  const { data, error } = await db.from('orders').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as Order) ?? null
}

export async function listOrderItems(orderId: string): Promise<OrderItem[]> {
  const { data, error } = await db
    .from('order_item').select('*')
    .eq('order_id', orderId)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as OrderItem[]
}

/**
 * Batched sibling of listOrderItems: fetch every line item for many orders in
 * one query per <=100-id chunk (kills the per-order N+1). Returns a flat array
 * with the same columns/row type as listOrderItems. Empty input -> [].
 */
export async function listOrderItemsForOrders(orderIds: string[]): Promise<OrderItem[]> {
  if (orderIds.length === 0) return []
  const ids = Array.from(new Set(orderIds))
  const out: OrderItem[] = []
  // PostgREST caps every response at its `max-rows` (Supabase default 1000), so a
  // 100-order chunk with many line items would be SILENTLY truncated. Page each
  // chunk with .range() until a page comes back short — this fetches all rows
  // regardless of the row cap (PAGE matches the platform default).
  const PAGE = 1000
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from('order_item').select('*')
        .in('order_id', chunk)
        .order('created_at')
        .range(from, from + PAGE - 1)
      if (error) throw error
      const rows = (data ?? []) as OrderItem[]
      out.push(...rows)
      if (rows.length < PAGE) break
    }
  }
  return out
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const patch: Partial<Order> = { status }
  if (status === 'closed' || status === 'paid') patch.closed_at = new Date().toISOString()
  const { error } = await db.from('orders').update(patch).eq('id', id)
  if (error) throw error
}

export async function updateOrder(id: string, patch: Partial<Order>): Promise<void> {
  const { error } = await db.from('orders').update(patch).eq('id', id)
  if (error) throw error
}

/* Create an order + items + kitchen tickets atomically (best effort on client). */
export async function placeOrder(params: {
  branch_id: string
  order_type: Order['order_type']
  table_id?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  waiter_id?: string | null
  notes?: string | null
  pickup_time?: string | null
  delivery_address?: string | null
  delivery_fee?: number | null
  lines: CartLine[]
  taxRate: number           // e.g. TAX_RATE (0.06) for 6% SST — required; pass 0 for tax-exempt
  discountAmount?: number
  membership_id?: string | null
}): Promise<Order> {
  const subtotal = params.lines.reduce(
    (s, l) => s + l.quantity * (Number(l.menuItem.price) + l.modifiers.reduce((m, x) => m + Number(x.price_delta), 0)),
    0,
  )
  const discount = Math.min(params.discountAmount ?? 0, subtotal)
  const taxable = Math.max(0, subtotal - discount)
  const tax = taxOn(taxable, params.taxRate)
  const total = Math.round((taxable + tax + Number(params.delivery_fee ?? 0)) * 100) / 100

  const { data: order, error: e1 } = await db.from('orders').insert({
    branch_id: params.branch_id,
    order_type: params.order_type,
    table_id: params.table_id ?? null,
    customer_name: params.customer_name ?? null,
    customer_phone: params.customer_phone ?? null,
    waiter_id: params.waiter_id ?? null,
    membership_id: params.membership_id ?? null,
    status: 'sent',
    subtotal,
    discount,
    tax,
    tip: 0,
    total,
    pickup_time: params.pickup_time ?? null,
    delivery_address: params.delivery_address ?? null,
    delivery_fee: params.delivery_fee ?? 0,
    notes: params.notes ?? null,
  }).select().single()
  if (e1) throw e1
  const o = order as Order

  const itemRows = params.lines.map((l) => ({
    order_id: o.id,
    menu_item_id: l.menuItem.id,
    quantity: l.quantity,
    unit_price: Number(l.menuItem.price),
    modifier_ids: l.modifiers.map((m) => m.id),
    modifiers_total: l.modifiers.reduce((s, m) => s + Number(m.price_delta), 0),
    special_instruction: l.specialInstruction ?? null,
    course_type: l.menuItem.course_type,
    status: 'fired' as OrderItemStatus,
  }))
  const { data: items, error: e2 } = await db.from('order_item').insert(itemRows).select()
  if (e2) throw e2

  const ticketRows = (items as OrderItem[]).map((it) => {
    const mi = params.lines.find((l) => l.menuItem.id === it.menu_item_id)?.menuItem
    return {
      branch_id: params.branch_id,
      order_id: o.id,
      order_item_id: it.id,
      station: mi?.station ?? 'kitchen',
      status: 'pending' as TicketStatus,
    }
  })
  if (ticketRows.length) {
    const { error: e3 } = await db.from('kitchen_ticket').insert(ticketRows)
    if (e3) throw e3
  }

  // Mark table occupied for dine-in
  if (params.table_id && params.order_type === 'dinein') {
    await updateTableStatus(params.table_id, 'occupied')
  }
  return o
}

/* Place an order for an unauthenticated guest (QR menu flow). Skips table-status update — staff handles it. */
export async function placeGuestOrder(params: {
  branch_id: string
  table_id?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  lines: CartLine[]
}): Promise<Order> {
  const subtotal = params.lines.reduce(
    (s, l) => s + l.quantity * (Number(l.menuItem.price) + l.modifiers.reduce((m, x) => m + Number(x.price_delta), 0)),
    0,
  )
  const tax = taxOn(subtotal, TAX_RATE)
  const total = Math.round((subtotal + tax) * 100) / 100

  const { data: order, error: e1 } = await db.from('orders').insert({
    branch_id: params.branch_id,
    order_type: 'dinein',
    source: 'qr',
    table_id: params.table_id ?? null,
    customer_name: params.customer_name ?? null,
    customer_phone: params.customer_phone ?? null,
    waiter_id: null,
    membership_id: null,
    status: 'sent',
    subtotal,
    discount: 0,
    tax,
    tip: 0,
    total,
    pickup_time: null,
    delivery_address: null,
    delivery_fee: 0,
    notes: null,
  }).select().single()
  if (e1) throw e1
  const o = order as Order

  const itemRows = params.lines.map((l) => ({
    order_id: o.id,
    menu_item_id: l.menuItem.id,
    quantity: l.quantity,
    unit_price: Number(l.menuItem.price),
    modifier_ids: l.modifiers.map((m) => m.id),
    modifiers_total: l.modifiers.reduce((s, m) => s + Number(m.price_delta), 0),
    special_instruction: l.specialInstruction ?? null,
    course_type: l.menuItem.course_type,
    status: 'fired' as OrderItemStatus,
  }))
  const { data: items, error: e2 } = await db.from('order_item').insert(itemRows).select()
  if (e2) throw e2

  const ticketRows = (items as OrderItem[]).map((it) => {
    const mi = params.lines.find((l) => l.menuItem.id === it.menu_item_id)?.menuItem
    return {
      branch_id: params.branch_id,
      order_id: o.id,
      order_item_id: it.id,
      station: mi?.station ?? 'kitchen',
      status: 'pending' as TicketStatus,
    }
  })
  if (ticketRows.length) {
    const { error: e3 } = await db.from('kitchen_ticket').insert(ticketRows)
    if (e3) throw e3
  }

  return o
}

export async function addItemsToOrder(orderId: string, branchId: string, lines: CartLine[]): Promise<void> {
  const rows = lines.map((l) => ({
    order_id: orderId,
    menu_item_id: l.menuItem.id,
    quantity: l.quantity,
    unit_price: Number(l.menuItem.price),
    modifier_ids: l.modifiers.map((m) => m.id),
    modifiers_total: l.modifiers.reduce((s, m) => s + Number(m.price_delta), 0),
    special_instruction: l.specialInstruction ?? null,
    course_type: l.menuItem.course_type,
    status: 'fired' as OrderItemStatus,
  }))
  const { data: items, error } = await db.from('order_item').insert(rows).select()
  if (error) throw error
  const tickets = (items as OrderItem[]).map((it) => {
    const mi = lines.find((l) => l.menuItem.id === it.menu_item_id)?.menuItem
    return { branch_id: branchId, order_id: orderId, order_item_id: it.id, station: mi?.station ?? 'kitchen', status: 'pending' as TicketStatus }
  })
  if (tickets.length) await db.from('kitchen_ticket').insert(tickets)

  // Recompute order totals
  const allItems = await listOrderItems(orderId)
  const subtotal = allItems.reduce((s, it) => s + it.quantity * (Number(it.unit_price) + Number(it.modifiers_total)), 0)
  await db.from('orders').update({ subtotal, total: subtotal }).eq('id', orderId)
}

export async function voidItem(itemId: string, reason: string, employeeId: string | null): Promise<void> {
  await db.from('order_item').update({
    status: 'voided' as OrderItemStatus,
    voided_reason: reason,
    voided_by: employeeId,
    voided_at: new Date().toISOString(),
  }).eq('id', itemId)
  await db.from('kitchen_ticket').update({ status: 'completed' }).eq('order_item_id', itemId)

  // Recompute order totals so the voided line stops inflating the balance.
  const { data: it } = await db.from('order_item').select('order_id').eq('id', itemId).single()
  if (!it?.order_id) return
  const { data: order } = await db.from('orders').select('discount').eq('id', it.order_id).single()
  const items = await listOrderItems(it.order_id)
  const { subtotal, tax, total } = recomputeOrderTotals(items, Number(order?.discount ?? 0))
  await db.from('orders').update({ subtotal, tax, total }).eq('id', it.order_id)
}
