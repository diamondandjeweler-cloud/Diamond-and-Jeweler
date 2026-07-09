/**
 * Restaurant data access — EMPLOYEE / TIMESHEET.
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { restaurantDb as db } from '../client'
import type { Employee, Timesheet } from '../types'

export async function listEmployees(branchId: string): Promise<Employee[]> {
  const { data, error } = await db
    .from('employee').select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return (data ?? []) as Employee[]
}

export async function employeeByPin(branchId: string, pin: string): Promise<Employee | null> {
  const { data, error } = await db
    .from('employee').select('*')
    .eq('branch_id', branchId)
    .eq('pin', pin)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  return (data as Employee) ?? null
}

export async function createEmployee(patch: Partial<Employee>): Promise<Employee> {
  const { data, error } = await db.from('employee').insert(patch).select().single()
  if (error) throw error
  return data as Employee
}

export async function updateEmployee(id: string, patch: Partial<Employee>): Promise<void> {
  const { error } = await db.from('employee').update(patch).eq('id', id)
  if (error) throw error
}

export async function clockIn(employeeId: string, branchId: string): Promise<Timesheet> {
  const open = await db.from('timesheet').select('*')
    .eq('employee_id', employeeId).is('clock_out', null).maybeSingle()
  if (open.data) return open.data as Timesheet
  const { data, error } = await db.from('timesheet').insert({
    employee_id: employeeId, branch_id: branchId, clock_in: new Date().toISOString(),
  }).select().single()
  if (error) throw error
  return data as Timesheet
}

export async function clockOut(timesheetId: string): Promise<void> {
  const now = new Date()
  const { data: ts, error: e1 } = await db.from('timesheet').select('clock_in').eq('id', timesheetId).single()
  if (e1) throw e1
  const clockIn = new Date((ts as { clock_in: string }).clock_in)
  const hours = Math.max(0, (now.getTime() - clockIn.getTime()) / 3_600_000)
  const overtime = Math.max(0, hours - 8)
  const { error } = await db.from('timesheet').update({
    clock_out: now.toISOString(),
    total_hours: Number(hours.toFixed(2)),
    overtime_hours: Number(overtime.toFixed(2)),
  }).eq('id', timesheetId)
  if (error) throw error
}

export async function listTimesheets(branchId: string, fromISO?: string): Promise<Timesheet[]> {
  let q = db.from('timesheet').select('*').eq('branch_id', branchId)
  if (fromISO) q = q.gte('clock_in', fromISO)
  const { data, error } = await q.order('clock_in', { ascending: false })
  if (error) throw error
  return (data ?? []) as Timesheet[]
}

export async function listOnDuty(branchId: string): Promise<Timesheet[]> {
  const { data, error } = await db.from('timesheet').select('*')
    .eq('branch_id', branchId).is('clock_out', null)
  if (error) throw error
  return (data ?? []) as Timesheet[]
}
