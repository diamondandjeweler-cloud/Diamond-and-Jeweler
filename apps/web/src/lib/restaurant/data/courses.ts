/**
 * Restaurant data access — COURSE FIRING.
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { restaurantDb as db } from '../client'
import { getOrder } from './orders'
import type { CourseFiring, OrderItem, TicketStatus } from '../types'

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
