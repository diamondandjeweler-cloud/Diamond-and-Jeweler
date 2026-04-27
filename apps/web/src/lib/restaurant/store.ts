/**
 * Restaurant data access layer.
 *
 * All Supabase calls for the restaurant feature go through this module so the
 * future migration to its own Supabase project is a one-file swap.
 * Uses `.schema('restaurant')` which is supported by @supabase/supabase-js v2
 * as long as the schema is exposed in PostgREST's db_schema config (it is).
 */
import { supabase } from '../supabase'
import type {
  Branch, RestaurantTable, Section, Reservation, WaitlistEntry,
  MenuCategory, MenuItem, Modifier, Ingredient, Recipe,
  Employee, Timesheet, Membership,
  Order, OrderItem, CourseFiring, KitchenTicket,
  InventoryTransaction, PurchaseOrder, PurchaseOrderLine, Supplier,
  Payment, CashierShift, Promotion, AuditLog, WasteLog, StockTransfer,
  CartLine, OrderStatus, OrderItemStatus, TicketStatus, TableStatus,
} from './types'

const db = supabase.schema('restaurant' as never) as unknown as ReturnType<typeof supabase.schema>

/* ============================================================
 * BRANCH
 * ============================================================ */

export async function listBranches(): Promise<Branch[]> {
  const { data, error } = await db.from('branch').select('*').order('created_at')
  if (error) throw error
  return (data ?? []) as Branch[]
}

export async function getBranch(id: string): Promise<Branch | null> {
  const { data, error } = await db.from('branch').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as Branch) ?? null
}

export async function createBranch(patch: Partial<Branch>): Promise<Branch> {
  const { data, error } = await db.from('branch').insert(patch).select().single()
  if (error) throw error
  return data as Branch
}

export async function updateBranch(id: string, patch: Partial<Branch>): Promise<Branch> {
  const { data, error } = await db.from('branch').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as Branch
}

/* ============================================================
 * TABLES & SECTIONS
 * ============================================================ */

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

/**
 * Tip pool distribution at shift close.
 * Sums all `tip` from orders in the shift window, splits proportionally
 * among waiters who clocked any time during the window, weighted by hours.
 * Returns the breakdown — caller can print or write to a payroll-prep table.
 */
export async function distributeTipPool(branchId: string, sinceISO: string): Promise<{
  total: number
  allocations: Array<{ employee_id: string; name: string; hours: number; share: number }>
}> {
  const [{ data: orders }, { data: ts }] = await Promise.all([
    db.from('orders').select('tip, waiter_id, created_at').eq('branch_id', branchId).gte('created_at', sinceISO).in('status', ['paid','closed']),
    db.from('timesheet').select('employee_id, clock_in, clock_out, total_hours').eq('branch_id', branchId).gte('clock_in', sinceISO),
  ])
  const total = (orders ?? []).reduce((s, o) => s + Number(o.tip ?? 0), 0)

  // Hours per waiter (counts any role for now — caller can filter)
  const hoursMap = new Map<string, number>()
  for (const t of (ts ?? []) as Array<{ employee_id: string; clock_in: string; clock_out: string | null; total_hours: number | null }>) {
    const h = t.total_hours != null
      ? Number(t.total_hours)
      : ((new Date(t.clock_out ?? Date.now()).getTime() - new Date(t.clock_in).getTime()) / 3600000)
    hoursMap.set(t.employee_id, (hoursMap.get(t.employee_id) ?? 0) + h)
  }
  const totalHours = Array.from(hoursMap.values()).reduce((s, h) => s + h, 0)
  if (total <= 0 || totalHours <= 0 || hoursMap.size === 0) {
    return { total, allocations: [] }
  }

  const empIds = Array.from(hoursMap.keys())
  const { data: emps } = await db.from('employee').select('id, name').in('id', empIds)
  const nameOf = new Map(((emps ?? []) as Array<{ id: string; name: string }>).map((e) => [e.id, e.name]))

  const allocations = Array.from(hoursMap.entries()).map(([id, h]) => ({
    employee_id: id,
    name: nameOf.get(id) ?? '—',
    hours: Math.round(h * 100) / 100,
    share: Math.round((total * (h / totalHours)) * 100) / 100,
  }))

  // Audit log entry per allocation
  for (const a of allocations) {
    await db.from('audit_log').insert({
      branch_id: branchId, action: 'tip_pool_distributed',
      entity_type: 'employee', entity_id: a.employee_id,
      reason: `Tip share ${a.share} (${a.hours}h)`,
      new_value: { total_pool: total, total_hours: totalHours, share: a.share },
    })
  }

  return { total, allocations }
}

/**
 * KDS → notify storekeepers when an ingredient runs out / is needed.
 * Inserts one notification row per storekeeper-role employee on the branch.
 */
export async function requestIngredient(
  branchId: string,
  ingredientName: string,
  ticketId: string,
  employeeId: string | null,
): Promise<void> {
  const { data: storekeepers } = await db.from('employee')
    .select('id').eq('branch_id', branchId).eq('role', 'storekeeper').eq('is_active', true)
  const targets = (storekeepers ?? []).map((s) => s.id)
  if (targets.length === 0) {
    // Nobody to notify yet — still write a single audit row so it's visible
    await db.from('audit_log').insert({
      branch_id: branchId, action: 'request_ingredient',
      entity_type: 'kitchen_ticket', entity_id: ticketId,
      employee_id: employeeId, reason: ingredientName,
    })
    return
  }
  await db.from('notification').insert(targets.map((id) => ({
    branch_id: branchId, employee_id: id,
    type: 'ingredient_request',
    title: `Ingredient request: ${ingredientName}`,
    body: 'Kitchen needs this restocked.',
    payload: { ticket_id: ticketId, ingredient: ingredientName },
  })))
  await db.from('audit_log').insert({
    branch_id: branchId, action: 'request_ingredient',
    entity_type: 'kitchen_ticket', entity_id: ticketId,
    employee_id: employeeId, reason: ingredientName,
  })
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
  const newTax = Math.round((newSubtotal - Number(order.discount)) * 0.06 * 100) / 100
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
  const newTax = Math.round((newSubtotal - Number(order.discount)) * 0.06 * 100) / 100
  const newTotal = newSubtotal - Number(order.discount) + newTax
  await db.from('orders').update({ subtotal: newSubtotal, tax: newTax, total: newTotal, status: 'sent' }).eq('id', orderId)
  return lines.length
}

export async function listSchedule(branchId: string): Promise<Array<{ id: string; employee_id: string; branch_id: string; shift_start: string; shift_end: string; section_id: string | null; notes: string | null }>> {
  const since = new Date(); since.setDate(since.getDate() - 7)
  const { data, error } = await db.from('shift_schedule')
    .select('id, employee_id, branch_id, shift_start, shift_end, section_id, notes')
    .eq('branch_id', branchId)
    .gte('shift_end', since.toISOString())
    .order('shift_start', { ascending: true })
  if (error) throw error
  return (data ?? []) as Array<{ id: string; employee_id: string; branch_id: string; shift_start: string; shift_end: string; section_id: string | null; notes: string | null }>
}

export async function createScheduleRow(patch: { employee_id: string; branch_id: string; shift_start: string; shift_end: string; section_id?: string | null; notes?: string | null }): Promise<void> {
  const { error } = await db.from('shift_schedule').insert(patch)
  if (error) throw error
}

export async function deleteScheduleRow(id: string): Promise<void> {
  const { error } = await db.from('shift_schedule').delete().eq('id', id)
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

/* ============================================================
 * RESERVATION & WAITLIST
 * ============================================================ */

export async function listReservations(branchId: string, fromISO?: string): Promise<Reservation[]> {
  let q = db.from('reservation').select('*').eq('branch_id', branchId)
  if (fromISO) q = q.gte('reservation_time', fromISO)
  const { data, error } = await q.order('reservation_time')
  if (error) throw error
  return (data ?? []) as Reservation[]
}

export async function createReservation(patch: Partial<Reservation>): Promise<Reservation> {
  const { data, error } = await db.from('reservation').insert(patch).select().single()
  if (error) throw error
  return data as Reservation
}

export async function updateReservation(id: string, patch: Partial<Reservation>): Promise<void> {
  const { error } = await db.from('reservation').update(patch).eq('id', id)
  if (error) throw error
}

export async function listWaitlist(branchId: string): Promise<WaitlistEntry[]> {
  const { data, error } = await db
    .from('waitlist').select('*')
    .eq('branch_id', branchId)
    .in('status', ['waiting', 'notified'])
    .order('requested_at')
  if (error) throw error
  return (data ?? []) as WaitlistEntry[]
}

export async function addToWaitlist(patch: Partial<WaitlistEntry>): Promise<WaitlistEntry> {
  const { data, error } = await db.from('waitlist').insert(patch).select().single()
  if (error) throw error
  return data as WaitlistEntry
}

export async function updateWaitlist(id: string, patch: Partial<WaitlistEntry>): Promise<void> {
  const { error } = await db.from('waitlist').update(patch).eq('id', id)
  if (error) throw error
}

/* ============================================================
 * MENU & MODIFIERS
 * ============================================================ */

export async function listCategories(branchId: string): Promise<MenuCategory[]> {
  const { data, error } = await db
    .from('menu_category').select('*')
    .or(`branch_id.eq.${branchId},branch_id.is.null`)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as MenuCategory[]
}

export async function listMenuItems(branchId: string): Promise<MenuItem[]> {
  const { data, error } = await db
    .from('menu_item').select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return (data ?? []) as MenuItem[]
}

export async function listAllMenuItems(branchId: string): Promise<MenuItem[]> {
  const { data, error } = await db
    .from('menu_item').select('*')
    .eq('branch_id', branchId)
    .order('name')
  if (error) throw error
  return (data ?? []) as MenuItem[]
}

export async function createMenuItem(patch: Partial<MenuItem>): Promise<MenuItem> {
  const { data, error } = await db.from('menu_item').insert(patch).select().single()
  if (error) throw error
  return data as MenuItem
}

export async function updateMenuItem(id: string, patch: Partial<MenuItem>): Promise<void> {
  const { error } = await db.from('menu_item').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteMenuItem(id: string): Promise<void> {
  const { error } = await db.from('menu_item').delete().eq('id', id)
  if (error) throw error
}

export async function listModifiersByItems(menuItemIds: string[]): Promise<Modifier[]> {
  if (menuItemIds.length === 0) return []
  const { data, error } = await db
    .from('modifier').select('*')
    .in('menu_item_id', menuItemIds)
    .eq('is_active', true)
  if (error) throw error
  return (data ?? []) as Modifier[]
}

/* ── Category CRUD ── */

export async function createCategory(patch: Partial<MenuCategory>): Promise<MenuCategory> {
  const { data, error } = await db.from('menu_category').insert(patch).select().single()
  if (error) throw error
  return data as MenuCategory
}

export async function updateCategory(id: string, patch: Partial<MenuCategory>): Promise<void> {
  const { error } = await db.from('menu_category').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await db.from('menu_category').delete().eq('id', id)
  if (error) throw error
}

/* ── Modifier CRUD ── */

export async function listModifiersForItem(menuItemId: string): Promise<Modifier[]> {
  const { data, error } = await db
    .from('modifier').select('*')
    .eq('menu_item_id', menuItemId)
    .order('name')
  if (error) throw error
  return (data ?? []) as Modifier[]
}

export async function createModifier(patch: Partial<Modifier>): Promise<Modifier> {
  const { data, error } = await db.from('modifier').insert(patch).select().single()
  if (error) throw error
  return data as Modifier
}

export async function updateModifier(id: string, patch: Partial<Modifier>): Promise<void> {
  const { error } = await db.from('modifier').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteModifier(id: string): Promise<void> {
  const { error } = await db.from('modifier').delete().eq('id', id)
  if (error) throw error
}

/* ── Menu item image upload ── */

export async function uploadMenuItemImage(branchId: string, file: File): Promise<string> {
  const ext  = file.name.split('.').pop() ?? 'jpg'
  const path = `${branchId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('restaurant-menu').upload(path, file, { upsert: true })
  if (error) throw error
  return supabase.storage.from('restaurant-menu').getPublicUrl(path).data.publicUrl
}

/* ============================================================
 * INVENTORY / INGREDIENTS / RECIPES
 * ============================================================ */

export async function listIngredients(branchId: string): Promise<Ingredient[]> {
  const { data, error } = await db
    .from('ingredient').select('*')
    .eq('branch_id', branchId)
    .order('name')
  if (error) throw error
  return (data ?? []) as Ingredient[]
}

export async function listRecipeFor(menuItemId: string): Promise<Recipe[]> {
  const { data, error } = await db.from('recipe').select('*').eq('menu_item_id', menuItemId)
  if (error) throw error
  return (data ?? []) as Recipe[]
}

export async function listRecipeForMany(menuItemIds: string[]): Promise<Recipe[]> {
  if (menuItemIds.length === 0) return []
  const { data, error } = await db.from('recipe').select('*').in('menu_item_id', menuItemIds)
  if (error) throw error
  return (data ?? []) as Recipe[]
}

export async function createIngredient(patch: Partial<Ingredient>): Promise<Ingredient> {
  const { data, error } = await db.from('ingredient').insert(patch).select().single()
  if (error) throw error
  return data as Ingredient
}

export async function updateIngredient(id: string, patch: Partial<Ingredient>): Promise<void> {
  const { error } = await db.from('ingredient').update(patch).eq('id', id)
  if (error) throw error
}

export async function listInventoryTxns(branchId: string, limit = 200): Promise<InventoryTransaction[]> {
  const { data, error } = await db
    .from('inventory_transaction').select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as InventoryTransaction[]
}

export async function addInventoryTxn(patch: Partial<InventoryTransaction>): Promise<void> {
  const { error } = await db.from('inventory_transaction').insert(patch)
  if (error) throw error
}

/* Adjust stock and log a transaction in one call.
 * Keeps the running `current_stock` on `ingredient` in sync. */
export async function adjustStock(
  ingredientId: string,
  delta: number,
  type: InventoryTransaction['type'],
  extras: { branch_id: string; reason?: string; unit_cost?: number; reference_order_id?: string; reference_po_id?: string; created_by?: string } = { branch_id: '' },
): Promise<void> {
  const ing = await db.from('ingredient').select('current_stock').eq('id', ingredientId).single()
  if (ing.error) throw ing.error
  const prev = Number(ing.data?.current_stock ?? 0)
  const next = prev + delta
  const upd = await db.from('ingredient').update({ current_stock: next }).eq('id', ingredientId)
  if (upd.error) throw upd.error
  const tx = await db.from('inventory_transaction').insert({
    branch_id: extras.branch_id,
    ingredient_id: ingredientId,
    quantity: delta,
    type,
    unit_cost: extras.unit_cost ?? null,
    reference_order_id: extras.reference_order_id ?? null,
    reference_po_id: extras.reference_po_id ?? null,
    reason: extras.reason ?? null,
    created_by: extras.created_by ?? null,
  })
  if (tx.error) throw tx.error
}

/* ============================================================
 * PURCHASE ORDERS
 * ============================================================ */

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

/* ============================================================
 * EMPLOYEE / TIMESHEET
 * ============================================================ */

export async function listEmployees(branchId: string): Promise<Employee[]> {
  const { data, error } = await db
    .from('employee').select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return (data ?? []) as Employee[]
}

export async function employeeByPin(branchId: string, pin: string): Promise<Employee | null> {
  const { data, error } = await db
    .from('employee').select('*')
    .eq('branch_id', branchId)
    .eq('pin', pin)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  return (data as Employee) ?? null
}

export async function createEmployee(patch: Partial<Employee>): Promise<Employee> {
  const { data, error } = await db.from('employee').insert(patch).select().single()
  if (error) throw error
  return data as Employee
}

export async function updateEmployee(id: string, patch: Partial<Employee>): Promise<void> {
  const { error } = await db.from('employee').update(patch).eq('id', id)
  if (error) throw error
}

export async function clockIn(employeeId: string, branchId: string): Promise<Timesheet> {
  const open = await db.from('timesheet').select('*')
    .eq('employee_id', employeeId).is('clock_out', null).maybeSingle()
  if (open.data) return open.data as Timesheet
  const { data, error } = await db.from('timesheet').insert({
    employee_id: employeeId, branch_id: branchId, clock_in: new Date().toISOString(),
  }).select().single()
  if (error) throw error
  return data as Timesheet
}

export async function clockOut(timesheetId: string): Promise<void> {
  const now = new Date()
  const { data: ts, error: e1 } = await db.from('timesheet').select('clock_in').eq('id', timesheetId).single()
  if (e1) throw e1
  const clockIn = new Date((ts as { clock_in: string }).clock_in)
  const hours = Math.max(0, (now.getTime() - clockIn.getTime()) / 3_600_000)
  const overtime = Math.max(0, hours - 8)
  const { error } = await db.from('timesheet').update({
    clock_out: now.toISOString(),
    total_hours: Number(hours.toFixed(2)),
    overtime_hours: Number(overtime.toFixed(2)),
  }).eq('id', timesheetId)
  if (error) throw error
}

export async function listTimesheets(branchId: string, fromISO?: string): Promise<Timesheet[]> {
  let q = db.from('timesheet').select('*').eq('branch_id', branchId)
  if (fromISO) q = q.gte('clock_in', fromISO)
  const { data, error } = await q.order('clock_in', { ascending: false })
  if (error) throw error
  return (data ?? []) as Timesheet[]
}

export async function listOnDuty(branchId: string): Promise<Timesheet[]> {
  const { data, error } = await db.from('timesheet').select('*')
    .eq('branch_id', branchId).is('clock_out', null)
  if (error) throw error
  return (data ?? []) as Timesheet[]
}

/* ============================================================
 * ORDERS
 * ============================================================ */

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
  taxRate?: number          // 0.06 for 6% SST
  discountAmount?: number
  membership_id?: string | null
}): Promise<Order> {
  const subtotal = params.lines.reduce(
    (s, l) => s + l.quantity * (Number(l.menuItem.price) + l.modifiers.reduce((m, x) => m + Number(x.price_delta), 0)),
    0,
  )
  const discount = Math.min(params.discountAmount ?? 0, subtotal)
  const taxable = Math.max(0, subtotal - discount)
  const tax = Math.round(taxable * (params.taxRate ?? 0) * 100) / 100
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
  const TAX_RATE = 0.06
  const subtotal = params.lines.reduce(
    (s, l) => s + l.quantity * (Number(l.menuItem.price) + l.modifiers.reduce((m, x) => m + Number(x.price_delta), 0)),
    0,
  )
  const tax = Math.round(subtotal * TAX_RATE * 100) / 100
  const total = Math.round((subtotal + tax) * 100) / 100

  const { data: order, error: e1 } = await db.from('orders').insert({
    branch_id: params.branch_id,
    order_type: 'dinein',
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
}

/* ============================================================
 * KITCHEN TICKETS
 * ============================================================ */

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

/* ============================================================
 * PAYMENTS / SHIFTS
 * ============================================================ */

export async function createPayment(patch: Partial<Payment>): Promise<Payment> {
  const { data, error } = await db.from('payment').insert(patch).select().single()
  if (error) throw error
  return data as Payment
}

export async function listPayments(branchId: string, fromISO?: string): Promise<Payment[]> {
  const q = db.from('payment').select('*, orders!inner(branch_id)')
    .eq('orders.branch_id', branchId)
  const { data, error } = fromISO ? await q.gte('created_at', fromISO) : await q
  if (error) throw error
  return (data ?? []) as Payment[]
}

export async function listPaymentsForOrder(orderId: string): Promise<Payment[]> {
  const { data, error } = await db.from('payment').select('*').eq('order_id', orderId)
  if (error) throw error
  return (data ?? []) as Payment[]
}

export async function refundPayment(paymentId: string, employeeId: string | null, reason: string): Promise<void> {
  await db.from('payment').update({
    status: 'refunded',
    refunded_by: employeeId,
    refunded_at: new Date().toISOString(),
    refund_reason: reason,
  }).eq('id', paymentId)
}

export async function openShift(branchId: string, employeeId: string, openingFloat: number): Promise<CashierShift> {
  const { data, error } = await db.from('cashier_shift').insert({
    branch_id: branchId, employee_id: employeeId, opening_float: openingFloat,
  }).select().single()
  if (error) throw error
  return data as CashierShift
}

export async function getOpenShift(branchId: string, employeeId: string): Promise<CashierShift | null> {
  const { data, error } = await db.from('cashier_shift').select('*')
    .eq('branch_id', branchId).eq('employee_id', employeeId).is('closed_at', null).maybeSingle()
  if (error) throw error
  return (data as CashierShift) ?? null
}

export async function closeShift(shiftId: string, actualCash: number, report: unknown): Promise<CashierShift> {
  const sh = await db.from('cashier_shift').select('*').eq('id', shiftId).single()
  if (sh.error) throw sh.error
  const shift = sh.data as CashierShift
  const expected = Number(shift.opening_float) + ((report as { cash_sales?: number })?.cash_sales ?? 0)
  const variance = actualCash - expected
  const { data, error } = await db.from('cashier_shift').update({
    closed_at: new Date().toISOString(),
    actual_cash: actualCash,
    expected_cash: expected,
    variance,
    z_report_json: report as never,
  }).eq('id', shiftId).select().single()
  if (error) throw error
  return data as CashierShift
}

/* ============================================================
 * PROMOTIONS
 * ============================================================ */

export async function listPromotions(branchId: string): Promise<Promotion[]> {
  const { data, error } = await db
    .from('promotion').select('*')
    .or(`branch_id.eq.${branchId},branch_id.is.null`)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Promotion[]
}

export async function createPromotion(patch: Partial<Promotion>): Promise<Promotion> {
  const { data, error } = await db.from('promotion').insert(patch).select().single()
  if (error) throw error
  return data as Promotion
}

export async function updatePromotion(id: string, patch: Partial<Promotion>): Promise<void> {
  const { error } = await db.from('promotion').update(patch).eq('id', id)
  if (error) throw error
}

/* Returns discount amount in RM for a given subtotal, at a given moment. */
export function evaluatePromotion(p: Promotion, subtotal: number, at: Date = new Date()): number {
  if (!p.is_active) return 0
  if (p.start_date && new Date(p.start_date) > at) return 0
  if (p.end_date && new Date(p.end_date) < at) return 0
  const rule = (p.rule_json ?? {}) as Record<string, unknown>
  if (p.type === 'time_based') {
    const from = String(rule.start_time ?? '')
    const to = String(rule.end_time ?? '')
    const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    if (from && to && !(hhmm >= from && hhmm < to)) return 0
  }
  const minSpend = Number(rule.min_spend ?? 0)
  if (subtotal < minSpend) return 0
  if (typeof rule.discount_pct === 'number') {
    return Math.round(subtotal * (rule.discount_pct as number) / 100 * 100) / 100
  }
  if (typeof rule.discount_amount === 'number') {
    return Math.min(subtotal, rule.discount_amount as number)
  }
  return 0
}

/* ============================================================
 * MEMBERSHIP
 * ============================================================ */

export async function findMembershipByPhone(branchId: string, phone: string): Promise<Membership | null> {
  const { data, error } = await db
    .from('membership').select('*')
    .eq('branch_id', branchId).eq('phone', phone).maybeSingle()
  if (error) throw error
  return (data as Membership) ?? null
}

export async function listMembers(branchId: string): Promise<Membership[]> {
  const { data, error } = await db.from('membership').select('*')
    .or(`branch_id.eq.${branchId},branch_id.is.null`).order('points', { ascending: false })
  if (error) throw error
  return (data ?? []) as Membership[]
}

export async function upsertMembership(patch: Partial<Membership>): Promise<Membership> {
  if (patch.id) {
    const { data, error } = await db.from('membership').update(patch).eq('id', patch.id).select().single()
    if (error) throw error
    return data as Membership
  }
  const { data, error } = await db.from('membership').insert(patch).select().single()
  if (error) throw error
  return data as Membership
}

export async function awardPoints(membershipId: string, delta: number): Promise<void> {
  const { data, error } = await db.from('membership').select('points').eq('id', membershipId).single()
  if (error) throw error
  const next = Math.max(0, Number((data as { points: number }).points) + delta)
  await db.from('membership').update({ points: next }).eq('id', membershipId)
}

/* ============================================================
 * AUDIT / WASTE
 * ============================================================ */

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
 * Server-side promotion evaluation for the cart. Walks each active BOGO /
 * combo / birthday / table-area / membership promo and returns the *highest*
 * discount and its label so we don't stack incompatible deals.
 */
export async function evaluateServerPromotions(
  promotions: import('./types').Promotion[],
  cart: Array<{ menu_item_id: string; quantity: number; unit_price: number }>,
  subtotal: number,
  membershipId: string | null,
  tableArea: string | null,
): Promise<{ total: number; label: string | null }> {
  const candidates = promotions.filter((p) =>
    p.is_active && ['bogo', 'combo', 'membership', 'table_area'].includes(p.type))
  if (candidates.length === 0) return { total: 0, label: null }
  let best = 0
  let label: string | null = null
  for (const p of candidates) {
    try {
      const { data } = await db.rpc('evaluate_promotion', {
        p_promotion_id: p.id,
        p_cart: cart as unknown as object,
        p_subtotal: subtotal,
        p_membership_id: membershipId,
        p_table_area: tableArea,
      })
      const amt = Number(data ?? 0)
      if (amt > best) { best = amt; label = p.name }
    } catch { /* ignore one bad promo */ }
  }
  return { total: best, label }
}

/**
 * Per-menu-item stock availability check. Returns a map of menu_item_id → boolean.
 * Items with no recipe rows are treated as available.
 *
 * Also enforces MA-04: items flagged `requires_chef` are unavailable if no
 * kitchen-role employee is currently clocked in at the branch.
 */
export async function menuAvailability(menuItemIds: string[], branchId?: string | null): Promise<Record<string, boolean>> {
  if (menuItemIds.length === 0) return {}
  const out: Record<string, boolean> = {}
  // Bulk: fetch recipe + per-item flags
  const [{ data: recipes }, { data: items }] = await Promise.all([
    db.from('recipe').select('menu_item_id, ingredient_id, quantity').in('menu_item_id', menuItemIds),
    db.from('menu_item').select('id, requires_chef').in('id', menuItemIds),
  ])
  const ingIds = Array.from(new Set((recipes ?? []).map((r) => r.ingredient_id)))
  const { data: ings } = ingIds.length === 0
    ? { data: [] as Array<{ id: string; current_stock: number; is_active: boolean }> }
    : await db.from('ingredient').select('id, current_stock, is_active').in('id', ingIds)
  const stockMap = new Map(((ings ?? []) as Array<{ id: string; current_stock: number; is_active: boolean }>).map((x) => [x.id, x]))

  // Kitchen-on-duty check (only if any item requires chef)
  const requiresChef = new Map(((items ?? []) as Array<{ id: string; requires_chef: boolean }>).map((x) => [x.id, !!x.requires_chef]))
  let kitchenOnDuty = true
  if (branchId && Array.from(requiresChef.values()).some((v) => v)) {
    try {
      const { data } = await db.rpc('is_kitchen_on_duty', { p_branch_id: branchId })
      kitchenOnDuty = data === true
    } catch { /* tolerate */ }
  }

  for (const id of menuItemIds) out[id] = true
  for (const r of (recipes ?? []) as Array<{ menu_item_id: string; ingredient_id: string; quantity: number }>) {
    const ing = stockMap.get(r.ingredient_id)
    if (!ing || !ing.is_active || Number(ing.current_stock) < Number(r.quantity)) {
      out[r.menu_item_id] = false
    }
  }
  if (!kitchenOnDuty) {
    for (const [id, needs] of requiresChef) {
      if (needs) out[id] = false
    }
  }
  return out
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

/* ============================================================
 * COURSE FIRING
 * ============================================================ */

export async function listCourseFirings(orderId: string): Promise<CourseFiring[]> {
  const { data, error } = await db.from('course_firing').select('*').eq('order_id', orderId).order('course_number')
  if (error) throw error
  return (data ?? []) as CourseFiring[]
}

export async function fireCourse(orderId: string, courseType: string, employeeId: string | null): Promise<void> {
  const now = new Date().toISOString()
  const { data } = await db.from('course_firing').select('id')
    .eq('order_id', orderId).eq('course_type', courseType).eq('status', 'held').maybeSingle()
  if (data) {
    await db.from('course_firing').update({ status: 'fired', fired_at: now, fired_by: employeeId })
      .eq('id', (data as { id: string }).id)
  } else {
    const num = (await db.from('course_firing').select('course_number', { count: 'exact', head: false }).eq('order_id', orderId)).data?.length ?? 0
    await db.from('course_firing').insert({
      order_id: orderId, course_type: courseType, course_number: num + 1, status: 'fired', fired_at: now, fired_by: employeeId,
    })
  }

  // Move held order_items with this course_type to fired + create tickets
  const { data: held } = await db.from('order_item').select('*').eq('order_id', orderId).eq('course_type', courseType).eq('status', 'held')
  if (held?.length) {
    const ids = (held as OrderItem[]).map((x) => x.id)
    await db.from('order_item').update({ status: 'fired' }).in('id', ids)
    const order = await getOrder(orderId)
    const items = held as OrderItem[]
    const tickets = await Promise.all(items.map(async (it) => {
      const mi = (await db.from('menu_item').select('station').eq('id', it.menu_item_id).single()).data as { station: string } | null
      return {
        branch_id: order?.branch_id ?? '',
        order_id: orderId,
        order_item_id: it.id,
        station: mi?.station ?? 'kitchen',
        status: 'pending' as TicketStatus,
      }
    }))
    await db.from('kitchen_ticket').insert(tickets)
  }
}

/* ============================================================
 * STOCK TRANSFER
 * ============================================================ */

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

/* ============================================================
 * Fine-grained helpers for dashboard
 * ============================================================ */

export async function dailySales(branchId: string, dayISO: string): Promise<number> {
  const { data, error } = await db
    .from('orders').select('total, created_at')
    .eq('branch_id', branchId).gte('created_at', dayISO)
  if (error) throw error
  return (data ?? []).reduce((s: number, r) => s + Number((r as Order).total ?? 0), 0)
}
