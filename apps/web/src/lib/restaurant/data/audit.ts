/**
 * Restaurant data access — AUDIT / WASTE.
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { restaurantDb as db } from '../client'
import type { AuditLog, WasteLog } from '../types'

export async function logAudit(patch: Partial<AuditLog>): Promise<void> {
  await db.from('audit_log').insert(patch)
}

export async function listAudit(branchId: string, limit = 200): Promise<AuditLog[]> {
  const { data, error } = await db
    .from('audit_log').select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as AuditLog[]
}

export async function logWaste(patch: Partial<WasteLog>): Promise<void> {
  await db.from('waste_log').insert(patch)
}

/**
 * KDS remake: re-queue the ticket and write a waste_log row for each ingredient
 * in the recipe (so wastage is tracked even though stock was already deducted
 * on the original "completed" event — or will be deducted on the new completion).
 */
export async function logRemake(
  ticketId: string,
  orderItemId: string | null,
  reason: string,
  branchId: string,
  employeeId: string | null,
): Promise<void> {
  if (!orderItemId) return
  // Pull menu_item_id and quantity for the order item
  const { data: oi } = await db.from('order_item').select('menu_item_id, quantity').eq('id', orderItemId).maybeSingle()
  if (!oi) return
  const { data: recipe } = await db.from('recipe').select('ingredient_id, quantity').eq('menu_item_id', oi.menu_item_id)
  for (const r of (recipe ?? []) as Array<{ ingredient_id: string; quantity: number }>) {
    const { data: ing } = await db.from('ingredient').select('cost_per_unit').eq('id', r.ingredient_id).maybeSingle()
    const cost = Number(ing?.cost_per_unit ?? 0)
    const qty = Number(r.quantity) * Number(oi.quantity ?? 1)
    await db.from('waste_log').insert({
      branch_id: branchId,
      ingredient_id: r.ingredient_id,
      quantity: qty,
      reason: 'remake',
      value_cost: qty * cost,
      created_by: employeeId,
    })
  }
  await db.from('audit_log').insert({
    branch_id: branchId,
    action: 'remake',
    entity_type: 'kitchen_ticket',
    entity_id: ticketId,
    reason,
    employee_id: employeeId,
  })
}

export async function listWaste(branchId: string, limit = 200): Promise<WasteLog[]> {
  const { data, error } = await db
    .from('waste_log').select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as WasteLog[]
}
