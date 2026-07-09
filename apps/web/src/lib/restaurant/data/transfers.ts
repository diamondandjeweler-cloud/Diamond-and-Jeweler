/**
 * Restaurant data access — STOCK TRANSFER.
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { restaurantDb as db } from '../client'
import { adjustStock } from './inventory'
import type { StockTransfer } from '../types'

export async function listTransfers(): Promise<StockTransfer[]> {
  const { data, error } = await db.from('stock_transfer').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as StockTransfer[]
}

export async function createTransfer(patch: Partial<StockTransfer>): Promise<StockTransfer> {
  const { data, error } = await db.from('stock_transfer').insert(patch).select().single()
  if (error) throw error
  return data as StockTransfer
}

export async function receiveTransfer(id: string, receivedBy: string | null): Promise<void> {
  const { data: t, error } = await db.from('stock_transfer').select('*').eq('id', id).single()
  if (error) throw error
  const tr = t as StockTransfer
  await adjustStock(tr.ingredient_id, -tr.quantity, 'transfer_out', { branch_id: tr.from_branch_id, unit_cost: tr.unit_cost })
  await adjustStock(tr.ingredient_id, tr.quantity, 'transfer_in', { branch_id: tr.to_branch_id, unit_cost: tr.unit_cost })
  await db.from('stock_transfer').update({
    status: 'received', received_at: new Date().toISOString(), received_by: receivedBy,
  }).eq('id', id)
}
