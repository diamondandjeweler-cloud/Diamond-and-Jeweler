/**
 * Restaurant data access — RESERVATION & WAITLIST.
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { restaurantDb as db } from '../client'
import type { Reservation, WaitlistEntry } from '../types'

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
