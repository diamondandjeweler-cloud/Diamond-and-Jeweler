/**
 * Restaurant data access — NOTIFICATIONS.
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { restaurantDb as db } from '../client'

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
