/**
 * Restaurant data access — MEMBERSHIP.
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { restaurantDb as db } from '../client'
import type { Membership } from '../types'

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
