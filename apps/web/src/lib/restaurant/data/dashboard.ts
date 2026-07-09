/**
 * Restaurant data access — Fine-grained helpers for dashboard.
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { restaurantDb as db } from '../client'
import type { Order } from '../types'

export async function dailySales(branchId: string, dayISO: string): Promise<number> {
  const { data, error } = await db
    .from('orders').select('total, created_at')
    .eq('branch_id', branchId).gte('created_at', dayISO)
  if (error) throw error
  return (data ?? []).reduce((s: number, r) => s + Number((r as Order).total ?? 0), 0)
}
