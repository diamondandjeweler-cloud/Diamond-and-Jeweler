/**
 * Restaurant data access — SHIFT SCHEDULE.
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { restaurantDb as db } from '../client'

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
