/**
 * Restaurant data access — PURCHASE ORDERS.
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { restaurantDb as db } from '../client'
import { adjustStock } from './inventory'
import type { Supplier, PurchaseOrder, PurchaseOrderLine } from '../types'

export async function listSuppliers(branchId: string): Promise<Supplier[]> {
  const { data, error } = await db
    .from('supplier').select('*')
    .eq('is_active', true)
    .or(`branch_id.eq.${branchId},branch_id.is.null`)
    .order('name')
  if (error) throw error
  return (data ?? []) as Supplier[]
}

export async function createSupplier(patch: Partial<Supplier>): Promise<Supplier> {
  const { data, error } = await db.from('supplier').insert(patch).select().single()
  if (error) throw error
  return data as Supplier
}

export async function listPurchaseOrders(branchId: string): Promise<PurchaseOrder[]> {
  const { data, error } = await db
    .from('purchase_order').select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PurchaseOrder[]
}

export async function listPOLines(poId: string): Promise<PurchaseOrderLine[]> {
  const { data, error } = await db.from('purchase_order_line').select('*').eq('po_id', poId)
  if (error) throw error
  return (data ?? []) as PurchaseOrderLine[]
}

export async function createPO(
  branchId: string,
  supplierId: string | null,
  expectedDate: string | null,
  lines: Array<{ ingredient_id: string; ordered_qty: number; unit_cost: number }>,
  notes?: string,
): Promise<PurchaseOrder> {
  const totalCost = lines.reduce((s, l) => s + l.ordered_qty * l.unit_cost, 0)
  const { data: po, error } = await db.from('purchase_order').insert({
    branch_id: branchId,
    supplier_id: supplierId,
    expected_date: expectedDate,
    status: 'draft',
    total_cost: totalCost,
    notes,
  }).select().single()
  if (error) throw error
  const polines = lines.map((l) => ({ ...l, po_id: (po as PurchaseOrder).id, received_qty: 0 }))
  const li = await db.from('purchase_order_line').insert(polines)
  if (li.error) throw li.error
  return po as PurchaseOrder
}

export async function receivePO(poId: string, lines: Array<{ id: string; received_qty: number; unit_cost: number }>, branchId: string): Promise<void> {
  for (const l of lines) {
    const { data: row } = await db.from('purchase_order_line').select('ingredient_id').eq('id', l.id).single()
    if (!row) continue
    await db.from('purchase_order_line').update({ received_qty: l.received_qty, unit_cost: l.unit_cost }).eq('id', l.id)
    await adjustStock(
      (row as { ingredient_id: string }).ingredient_id,
      l.received_qty,
      'receive',
      { branch_id: branchId, unit_cost: l.unit_cost, reference_po_id: poId },
    )
  }
  await db.from('purchase_order').update({ status: 'received', received_at: new Date().toISOString() }).eq('id', poId)
}
