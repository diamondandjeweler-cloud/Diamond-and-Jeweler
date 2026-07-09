/**
 * Restaurant data access — BRANCH.
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { restaurantDb as db } from '../client'
import type { Branch } from '../types'

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
