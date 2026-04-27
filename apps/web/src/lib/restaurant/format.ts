/**
 * Tiny formatters for the restaurant UI. Keep this module pure (no React).
 */

export const MYR = (amount: number | null | undefined): string => {
  const n = Number(amount ?? 0)
  return `RM ${n.toFixed(2)}`
}

export function minutesAgo(iso: string | null | undefined): number {
  if (!iso) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
}

export function shortTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}

export function ticketAgeTone(iso: string | null | undefined): 'green' | 'amber' | 'red' {
  const mins = minutesAgo(iso)
  if (mins < 2) return 'green'
  if (mins < 8) return 'amber'
  return 'red'
}

export function tableStatusColor(status: string): string {
  switch (status) {
    case 'free':        return 'bg-emerald-100 border-emerald-400 text-emerald-900'
    case 'occupied':    return 'bg-red-100 border-red-400 text-red-900'
    case 'reserved':    return 'bg-amber-100 border-amber-400 text-amber-900'
    case 'cleaning':    return 'bg-yellow-100 border-yellow-400 text-yellow-900'
    default:            return 'bg-ink-100 border-ink-300 text-ink-600'
  }
}

export const BRANCH_STORAGE_KEY = 'rst.branchId'
export const EMPLOYEE_STORAGE_KEY = 'rst.employeeId'
