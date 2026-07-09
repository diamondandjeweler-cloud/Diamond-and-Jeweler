/**
 * Restaurant data access — INVENTORY / INGREDIENTS / RECIPES.
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { restaurantDb as db } from '../client'
import type { Ingredient, Recipe, InventoryTransaction } from '../types'

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
