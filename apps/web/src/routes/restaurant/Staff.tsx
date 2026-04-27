import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, Select, Spinner } from '../../components/ui'
import { useRestaurant } from '../../lib/restaurant/context'
import {
  listEmployees, createEmployee, updateEmployee, employeeByPin,
  clockIn, clockOut, listTimesheets, listOnDuty,
} from '../../lib/restaurant/store'
import type { Employee, EmployeeRole, Timesheet } from '../../lib/restaurant/types'
import { shortDate, shortTime } from '../../lib/restaurant/format'

export default function Staff() {
  const { branchId, employee, setEmployeeId } = useRestaurant()
  const [tab, setTab] = useState<'clock' | 'roster' | 'schedule' | 'timesheet'>('clock')
  const [list, setList] = useState<Employee[]>([])
  const [on, setOn] = useState<Timesheet[]>([])
  const [ts, setTs] = useState<Timesheet[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const refresh = async () => {
    if (!branchId) return
    setLoading(true); setErr(null)
    try {
      const since = new Date(); since.setDate(since.getDate() - 7)
      const [e, o, t] = await Promise.all([listEmployees(branchId), listOnDuty(branchId), listTimesheets(branchId, since.toISOString())])
      setList(e); setOn(o); setTs(t)
    } catch (e) { setErr((e as Error).message) } finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [branchId])

  if (!branchId) return <EmptyState title="Pick a branch first" />
  if (loading && list.length === 0) return <div className="py-10 text-center"><Spinner /> Loading…</div>

  return (
    <div className="space-y-4">
      {err && <Alert tone="red">{err}</Alert>}
      <div className="flex gap-1 flex-wrap">
        {(['clock','roster','schedule','timesheet'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize ${tab === t ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'}`}>
            {t === 'clock' ? 'Clock in / out' : t === 'roster' ? 'Roster' : t === 'schedule' ? 'Schedule' : 'Timesheet'}
          </button>
        ))}
      </div>

      {tab === 'clock' && <ClockTab branchId={branchId} employees={list} onDuty={on} activeEmployeeId={employee?.id ?? null} setEmployeeId={setEmployeeId} onChanged={refresh} />}
      {tab === 'roster' && <RosterTab employees={list} branchId={branchId} onChanged={refresh} />}
      {tab === 'schedule' && <ScheduleTab employees={list} branchId={branchId} />}
      {tab === 'timesheet' && <TimesheetTab timesheets={ts} employees={list} onChanged={refresh} />}
    </div>
  )
}

function ClockTab({ branchId, employees, onDuty, activeEmployeeId, setEmployeeId, onChanged }: {
  branchId: string
  employees: Employee[]
  onDuty: Timesheet[]
  activeEmployeeId: string | null
  setEmployeeId: (id: string | null) => void
  onChanged: () => Promise<void>
}) {
  const [pin, setPin] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onClockIn = async () => {
    if (!pin) return
    setBusy(true); setMsg(null)
    try {
      const e = await employeeByPin(branchId, pin)
      if (!e) { setMsg('Invalid PIN'); return }
      await clockIn(e.id, branchId)
      setEmployeeId(e.id)
      setMsg(`Welcome ${e.name} (${e.role}) · clocked in`)
      setPin('')
      await onChanged()
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }

  const onClockOut = async (tsId: string) => {
    await clockOut(tsId)
    await onChanged()
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardBody>
          <h3 className="font-display text-lg mb-3">Clock in</h3>
          <Input label="PIN" type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••" />
          <Button className="w-full" onClick={onClockIn} loading={busy}>Clock in</Button>
          {msg && <div className="mt-2 text-sm">{msg}</div>}
          {activeEmployeeId && (
            <div className="mt-4 pt-4 border-t text-sm">
              <div className="text-ink-500">Currently signed in as an employee:</div>
              <div className="font-medium">{employees.find((e) => e.id === activeEmployeeId)?.name ?? '—'}</div>
              <button className="btn-ghost btn-sm mt-2" onClick={() => setEmployeeId(null)}>Sign out</button>
            </div>
          )}
          <div className="mt-4 text-xs text-ink-400">Tip: seed PINs are 1111, 2222, 3333, 4444, 5555, 9999.</div>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <h3 className="font-display text-lg mb-3">On duty ({onDuty.length})</h3>
          {onDuty.length === 0 ? (
            <div className="text-sm text-ink-500">No one on duty.</div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {onDuty.map((t) => {
                const e = employees.find((x) => x.id === t.employee_id)
                return (
                  <li key={t.id} className="py-2 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{e?.name ?? '—'}</div>
                      <div className="text-xs text-ink-500">{e?.role} · since {shortTime(t.clock_in)}</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => onClockOut(t.id)}>Clock out</Button>
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function RosterTab({ employees, branchId, onChanged }: { employees: Employee[]; branchId: string; onChanged: () => Promise<void> }) {
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<{ name: string; role: EmployeeRole; hourly_rate: number; pin: string }>({ name: '', role: 'waiter', hourly_rate: 18, pin: '' })
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    if (!form.name) { setErr('Name required'); return }
    try { await createEmployee({ ...form, branch_id: branchId }); setForm({ name: '', role: 'waiter', hourly_rate: 18, pin: '' }); setCreating(false); setErr(null); await onChanged() }
    catch (e) { setErr((e as Error).message) }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="font-display text-lg">Roster ({employees.length})</h2>
        <Button onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : '+ New employee'}</Button>
      </div>
      {creating && <Card><CardBody>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as EmployeeRole })}>
            <option value="waiter">Waiter</option>
            <option value="kitchen">Kitchen</option>
            <option value="bar">Bar</option>
            <option value="cashier">Cashier</option>
            <option value="host">Host</option>
            <option value="storekeeper">Storekeeper</option>
            <option value="shift_manager">Shift Manager</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </Select>
          <Input label="Hourly rate" type="number" step="0.01" value={String(form.hourly_rate)} onChange={(e) => setForm({ ...form, hourly_rate: parseFloat(e.target.value) || 0 })} />
          <Input label="PIN (4-6 digits)" maxLength={6} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} />
        </div>
        {err && <Alert tone="red">{err}</Alert>}
        <Button onClick={save}>Save</Button>
      </CardBody></Card>}

      <Card><CardBody className="p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-500 bg-ink-50">
            <tr><th className="p-3">Name</th><th className="p-3">Role</th><th className="p-3 text-right">Rate</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-t border-ink-100">
                <td className="p-3 font-medium">{e.name}</td>
                <td className="p-3"><Badge tone="gray">{e.role}</Badge></td>
                <td className="p-3 text-right">RM {Number(e.hourly_rate ?? 0).toFixed(2)}</td>
                <td className="p-3">{e.is_active ? <Badge tone="green">active</Badge> : <Badge tone="red">inactive</Badge>}</td>
                <td className="p-3">
                  <button className="btn-ghost btn-sm" onClick={async () => {
                    await updateEmployee(e.id, { is_active: !e.is_active })
                    await onChanged()
                  }}>{e.is_active ? 'Deactivate' : 'Activate'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody></Card>
    </div>
  )
}

function TimesheetTab({ timesheets, employees, onChanged: _ }: { timesheets: Timesheet[]; employees: Employee[]; onChanged: () => Promise<void> }) {
  const total = timesheets.reduce((s, t) => s + Number(t.total_hours ?? 0), 0)
  const byEmp = timesheets.reduce<Record<string, number>>((acc, t) => { acc[t.employee_id] = (acc[t.employee_id] ?? 0) + Number(t.total_hours ?? 0); return acc }, {})

  const exportPayrollCsv = () => {
    const rows: string[][] = [['employee', 'role', 'hourly_rate', 'hours', 'overtime', 'pay_estimate']]
    employees.forEach((e) => {
      const hrs = timesheets.filter((t) => t.employee_id === e.id)
      const tot = hrs.reduce((s, t) => s + Number(t.total_hours ?? 0), 0)
      const ot  = hrs.reduce((s, t) => s + Number(t.overtime_hours ?? 0), 0)
      const reg = Math.max(0, tot - ot)
      const rate = Number(e.hourly_rate ?? 0)
      const pay = reg * rate + ot * rate * 1.5
      if (tot > 0) rows.push([e.name, e.role, rate.toFixed(2), tot.toFixed(2), ot.toFixed(2), pay.toFixed(2)])
    })
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `payroll-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3">
      <Card><CardBody>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-display text-lg">Last 7 days</h3>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-ink-500">Total: {total.toFixed(1)}h</span>
            <button className="btn-ghost btn-sm" onClick={exportPayrollCsv}>Export payroll CSV</button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          {Object.entries(byEmp).map(([id, hrs]) => {
            const e = employees.find((x) => x.id === id)
            return <div key={id} className="card p-3"><div className="text-xs text-ink-500">{e?.name}</div><div className="font-display">{hrs.toFixed(1)}h</div><div className="text-xs text-ink-400">{e?.role}</div></div>
          })}
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-500">
            <tr><th className="pb-2">Date</th><th className="pb-2">Employee</th><th className="pb-2">In</th><th className="pb-2">Out</th><th className="pb-2 text-right">Hours</th><th className="pb-2 text-right">OT</th></tr>
          </thead>
          <tbody>
            {timesheets.map((t) => {
              const e = employees.find((x) => x.id === t.employee_id)
              return (
                <tr key={t.id} className="border-t border-ink-100">
                  <td className="py-2">{shortDate(t.clock_in)}</td>
                  <td className="py-2">{e?.name ?? '—'}</td>
                  <td className="py-2">{shortTime(t.clock_in)}</td>
                  <td className="py-2">{t.clock_out ? shortTime(t.clock_out) : <Badge tone="brand">on duty</Badge>}</td>
                  <td className="py-2 text-right">{t.total_hours ? Number(t.total_hours).toFixed(2) : '—'}</td>
                  <td className="py-2 text-right">{t.overtime_hours ? Number(t.overtime_hours).toFixed(2) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardBody></Card>
    </div>
  )
}

interface ScheduleRow {
  id: string
  employee_id: string
  branch_id: string
  shift_start: string
  shift_end: string
  notes: string | null
  section_id?: string | null
}

function ScheduleTab({ employees, branchId }: { employees: Employee[]; branchId: string }) {
  const [rows, setRows] = useState<ScheduleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [employeeId, setEmployeeId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const { listSchedule } = await import('../../lib/restaurant/store')
      const data = await listSchedule(branchId)
      setRows(data)
    } catch (e) { setErr((e as Error).message) }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [branchId])

  const create = async () => {
    if (!employeeId || !start || !end) { setErr('Pick employee + start + end'); return }
    if (new Date(end) <= new Date(start)) { setErr('End must be after start'); return }
    try {
      const { createScheduleRow } = await import('../../lib/restaurant/store')
      await createScheduleRow({ employee_id: employeeId, branch_id: branchId, shift_start: start, shift_end: end })
      setEmployeeId(''); setStart(''); setEnd(''); setErr(null)
      await refresh()
    } catch (e) { setErr((e as Error).message) }
  }

  const remove = async (id: string) => {
    const { deleteScheduleRow } = await import('../../lib/restaurant/store')
    await deleteScheduleRow(id)
    await refresh()
  }

  if (loading) return <div className="py-6 text-center"><Spinner /> Loading…</div>

  return (
    <div className="space-y-3">
      <Card><CardBody>
        <h3 className="font-display text-lg mb-3">New shift</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Select label="Employee" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Pick…</option>
            {employees.filter((e) => e.is_active).map((e) => <option key={e.id} value={e.id}>{e.name} ({e.role})</option>)}
          </Select>
          <Input label="Start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          <Input label="End"   type="datetime-local" value={end}   onChange={(e) => setEnd(e.target.value)} />
          <div className="flex items-end"><Button onClick={create}>Add shift</Button></div>
        </div>
        {err && <Alert tone="red">{err}</Alert>}
      </CardBody></Card>

      <Card><CardBody>
        <h3 className="font-display text-lg mb-3">Upcoming + recent shifts</h3>
        {rows.length === 0 ? <div className="text-sm text-ink-500">No shifts scheduled.</div> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-500"><tr><th className="pb-2">Employee</th><th className="pb-2">Start</th><th className="pb-2">End</th><th className="pb-2 text-right">Hours</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => {
                const e = employees.find((x) => x.id === r.employee_id)
                const hrs = (new Date(r.shift_end).getTime() - new Date(r.shift_start).getTime()) / 3600000
                return (
                  <tr key={r.id} className="border-t border-ink-100">
                    <td className="py-2">{e?.name ?? '—'}</td>
                    <td className="py-2">{shortDate(r.shift_start)} {shortTime(r.shift_start)}</td>
                    <td className="py-2">{shortDate(r.shift_end)} {shortTime(r.shift_end)}</td>
                    <td className="py-2 text-right">{hrs.toFixed(1)}</td>
                    <td className="py-2 text-right">
                      <button className="text-xs text-red-500" onClick={() => void remove(r.id)}>Remove</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </CardBody></Card>
    </div>
  )
}
