/**
 * Restaurant data access — KITCHEN TICKETS.
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { restaurantDb as db } from '../client'
import type { KitchenTicket, TicketStatus, OrderItemStatus } from '../types'

export async function listKitchenTickets(branchId: string, stations: string[] = []): Promise<KitchenTicket[]> {
  let q = db.from('kitchen_ticket').select('*')
    .eq('branch_id', branchId)
    .in('status', ['pending', 'acknowledged', 'started', 'ready'])
    .order('created_at')
  if (stations.length) q = q.in('station', stations)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as KitchenTicket[]
}

export async function updateTicketStatus(id: string, status: TicketStatus, extras: Partial<KitchenTicket> = {}): Promise<void> {
  const patch: Partial<KitchenTicket> = { status, ...extras }
  const now = new Date().toISOString()
  if (status === 'acknowledged') patch.acknowledged_at = now
  if (status === 'started')      patch.started_at = now
  if (status === 'ready')        patch.ready_at = now
  if (status === 'completed')    patch.completed_at = now
  const { error } = await db.from('kitchen_ticket').update(patch).eq('id', id)
  if (error) throw error

  // Propagate ticket state to order_item
  const { data: t } = await db.from('kitchen_ticket').select('order_item_id').eq('id', id).single()
  const oiId = (t as { order_item_id: string } | null)?.order_item_id
  if (oiId) {
    const itemStatus: OrderItemStatus =
      status === 'acknowledged' ? 'preparing'
      : status === 'started' ? 'preparing'
      : status === 'ready' ? 'ready'
      : status === 'completed' ? 'served'
      : status === 'rejected' ? 'rejected'
      : 'pending'
    await db.from('order_item').update({ status: itemStatus }).eq('id', oiId)
  }
}
