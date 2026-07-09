/**
 * Restaurant data access — PAYMENTS / SHIFTS.
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { restaurantDb as db } from '../client'
import { computeShiftVariance } from '../domain/shifts'
import type { Payment, CashierShift } from '../types'

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
  // Pure variance math; the DAL coerces the DB float + extracts the report field.
  const { expected, variance } = computeShiftVariance(
    Number(shift.opening_float),
    (report as { cash_sales?: number })?.cash_sales ?? 0,
    actualCash,
  )
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
