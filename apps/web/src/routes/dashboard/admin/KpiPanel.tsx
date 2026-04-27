import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import LoadingSpinner from '../../../components/LoadingSpinner'

interface Kpis {
  total_matches: number
  by_status: Record<string, number>
  total_users: number
  banned_users: number
  ghost_users: number
  active_talents: number
  active_roles: number
  companies_verified: number
  companies_pending: number
  waitlist_pending: number
  avg_hours_to_first_view: number | null
  interview_hire_rate: number | null
}

const TRACKED_STATUSES = [
  'generated','viewed','accepted_by_talent','declined_by_talent',
  'invited_by_manager','declined_by_manager','hr_scheduling',
  'interview_scheduled','interview_completed','hired','expired',
]

export default function KpiPanel() {
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setLoading(true); setErr(null)
    try {
      // Count helper — PostgREST's head+count is cheap.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const count = async (table: string, modify?: (q: any) => any): Promise<number> => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const base: any = supabase.from(table).select('*', { count: 'exact', head: true })
        const q = modify ? modify(base) : base
        const { count: c, error } = await q
        if (error) throw error
        return c ?? 0
      }

      const total_matches = await count('matches')
      const by_status: Record<string, number> = {}
      await Promise.all(TRACKED_STATUSES.map(async (s) => {
        by_status[s] = await count('matches', (q) => q.eq('status', s))
      }))

      const total_users       = await count('profiles')
      const banned_users      = await count('profiles', (q) => q.eq('is_banned', true))
      const ghost_users       = await count('profiles', (q) => q.gte('ghost_score', 3))
      const active_talents    = await count('talents',  (q) => q.eq('is_open_to_offers', true))
      const active_roles      = await count('roles',    (q) => q.eq('status', 'active'))
      const companies_verified = await count('companies', (q) => q.eq('verified', true))
      const companies_pending  = await count('companies', (q) => q.eq('verified', false))
      const waitlist_pending   = await count('waitlist',  (q) => q.eq('approved', false))

      // Avg time-to-first-view (last 200 viewed matches, client-side avg).
      const { data: viewedRows } = await supabase
        .from('matches')
        .select('created_at, viewed_at')
        .not('viewed_at', 'is', null)
        .order('viewed_at', { ascending: false })
        .limit(200)
      let avg_hours_to_first_view: number | null = null
      if (viewedRows && viewedRows.length > 0) {
        const ms = viewedRows.reduce((sum, r) => {
          const c = new Date(r.created_at as string).getTime()
          const v = new Date(r.viewed_at as string).getTime()
          return sum + Math.max(0, v - c)
        }, 0) / viewedRows.length
        avg_hours_to_first_view = ms / 1000 / 60 / 60
      }

      // Interview hire rate = hired / (interview_completed + hired).
      const hired = by_status['hired']
      const completed = by_status['interview_completed']
      const denom = hired + completed
      const interview_hire_rate = denom > 0 ? hired / denom : null

      setKpis({
        total_matches, by_status, total_users, banned_users, ghost_users,
        active_talents, active_roles, companies_verified, companies_pending,
        waitlist_pending, avg_hours_to_first_view, interview_hire_rate,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  if (loading) return <LoadingSpinner />
  if (err) return <p className="text-sm text-red-600">{err}</p>
  if (!kpis) return null

  const expiry_rate = kpis.total_matches > 0
    ? kpis.by_status['expired'] / kpis.total_matches
    : 0
  const ghost_rate = kpis.total_users > 0
    ? kpis.ghost_users / kpis.total_users
    : 0

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-600">Live platform metrics. All counts are exact, computed at load time.</p>
        <button onClick={() => void load()} className="border px-3 py-1 rounded text-sm hover:bg-gray-50">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Active matches" value={
          kpis.by_status['generated'] + kpis.by_status['viewed'] +
          kpis.by_status['accepted_by_talent'] + kpis.by_status['invited_by_manager'] +
          kpis.by_status['hr_scheduling'] + kpis.by_status['interview_scheduled']
        } />
        <Stat label="Hired" value={kpis.by_status['hired']} />
        <Stat label="Expired" value={kpis.by_status['expired']} />
        <Stat label="Total matches (all time)" value={kpis.total_matches} />

        <Stat label="Active talents" value={kpis.active_talents} />
        <Stat label="Active roles" value={kpis.active_roles} />
        <Stat label="Verified companies" value={kpis.companies_verified} />
        <Stat label="Pending verification" value={kpis.companies_pending} highlight={kpis.companies_pending > 0} />

        <Stat label="Total users" value={kpis.total_users} />
        <Stat label="Banned users" value={kpis.banned_users} highlight={kpis.banned_users > 0} />
        <Stat label="Ghosting users (≥3)" value={kpis.ghost_users} highlight={kpis.ghost_users > 0} />
        <Stat label="Waitlist pending" value={kpis.waitlist_pending} highlight={kpis.waitlist_pending > 0} />
      </div>

      <h3 className="font-semibold text-sm mb-3">Rates</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Rate label="Match expiry rate"      value={expiry_rate} hint="expired / total matches" />
        <Rate label="Ghosting rate"          value={ghost_rate}  hint="ghost_score ≥ 3 / all users" />
        <Rate label="Interview → hire rate"  value={kpis.interview_hire_rate}
              hint={kpis.interview_hire_rate === null ? 'no interviews yet' : 'hired / (completed + hired)'} />
      </div>

      <h3 className="font-semibold text-sm mb-3">Latency</h3>
      <div className="grid grid-cols-1 gap-3 mb-6">
        <Stat
          label="Avg. time to first view (last 200 viewed matches)"
          value={kpis.avg_hours_to_first_view === null ? '—' : `${kpis.avg_hours_to_first_view.toFixed(1)} h`}
        />
      </div>

      <h3 className="font-semibold text-sm mb-3">Matches by status</h3>
      <div className="bg-white border rounded p-4">
        <table className="w-full text-sm">
          <tbody>
            {TRACKED_STATUSES.map((s) => (
              <tr key={s} className="border-b last:border-0">
                <td className="py-1.5 capitalize text-gray-700">{s.replace(/_/g, ' ')}</td>
                <td className="py-1.5 text-right font-mono">{kpis.by_status[s]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({
  label, value, highlight,
}: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`bg-white border rounded p-3 ${highlight ? 'border-amber-300' : ''}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-semibold ${highlight ? 'text-amber-700' : ''}`}>{value}</div>
    </div>
  )
}

function Rate({ label, value, hint }: { label: string; value: number | null; hint: string }) {
  const pct = value === null ? '—' : `${(value * 100).toFixed(1)}%`
  return (
    <div className="bg-white border rounded p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{pct}</div>
      <div className="text-xs text-gray-400 mt-1">{hint}</div>
    </div>
  )
}
