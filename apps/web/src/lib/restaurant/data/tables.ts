/**
 * Restaurant data access — TABLES & SECTIONS.
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { restaurantDb as db } from '../client'
import type { RestaurantTable, Section, TableStatus } from '../types'

export async function listTables(branchId: string): Promise<RestaurantTable[]> {
  const { data, error } = await db
    .from('restaurant_table').select('*')
    .eq('branch_id', branchId)
    .order('table_number')
  if (error) throw error
  return (data ?? []) as RestaurantTable[]
}

export async function updateTableStatus(id: string, status: TableStatus): Promise<void> {
  const { error } = await db.from('restaurant_table').update({
    status,
    last_status_change: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
}

export async function createTable(patch: Partial<RestaurantTable>): Promise<RestaurantTable> {
  const { data, error } = await db.from('restaurant_table').insert(patch).select().single()
  if (error) throw error
  return data as RestaurantTable
}

export async function updateTable(id: string, patch: Partial<RestaurantTable>): Promise<void> {
  const { error } = await db.from('restaurant_table').update(patch).eq('id', id)
  if (error) throw error
}

export async function transferActiveOrder(fromTableId: string, toTableId: string): Promise<void> {
  // Move every active order from one table to another, free the source.
  await db.from('orders').update({ table_id: toTableId })
    .eq('table_id', fromTableId)
    .in('status', ['active','sent','partial','ready','served'])
  await db.from('restaurant_table').update({ status: 'occupied', last_status_change: new Date().toISOString() }).eq('id', toTableId)
  await db.from('restaurant_table').update({ status: 'free', last_status_change: new Date().toISOString() }).eq('id', fromTableId)
}

export async function mergeTables(destTableId: string, sourceTableId: string): Promise<void> {
  // Move all active orders from source onto destination, free the source.
  await db.from('orders').update({ table_id: destTableId })
    .eq('table_id', sourceTableId)
    .in('status', ['active','sent','partial','ready','served'])
  await db.from('restaurant_table').update({ status: 'free', last_status_change: new Date().toISOString() }).eq('id', sourceTableId)
}

export async function deleteTable(id: string): Promise<void> {
  const { error } = await db.from('restaurant_table').delete().eq('id', id)
  if (error) throw error
}

export async function listSections(branchId: string): Promise<Section[]> {
  const { data, error } = await db.from('section').select('*').eq('branch_id', branchId).order('name')
  if (error) throw error
  return (data ?? []) as Section[]
}
