/**
 * Restaurant data access — MENU & MODIFIERS.
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { supabase } from '../../supabase'
import { restaurantDb as db } from '../client'
import type { MenuCategory, MenuItem, Modifier } from '../types'

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
