/**
 * Restaurant data access — PROMOTIONS.
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { restaurantDb as db } from '../client'
import type { Promotion } from '../types'

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

/* Returns discount amount in RM for a given subtotal, at a given moment.
 * The pure math now lives in `domain/promotions.ts`; re-exported here so existing
 * importers (`import { evaluatePromotion } from '.../store'`) keep working. */
export { evaluatePromotion } from '../domain/promotions'

/**
 * Server-side promotion evaluation for the cart. Walks each active BOGO /
 * combo / birthday / table-area / membership promo and returns the *highest*
 * discount and its label so we don't stack incompatible deals.
 */
export async function evaluateServerPromotions(
  promotions: import('../types').Promotion[],
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
