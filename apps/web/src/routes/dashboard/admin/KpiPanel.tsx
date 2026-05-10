import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import LoadingSpinner from '../../../components/LoadingSpinner'
import { formatError } from '../../../lib/errors'

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
      // F1 fix — single SECURITY DEFINER RPC replaces 14 parallel head+count
      // queries. The old pattern was returning 503 across all matches/profiles
      // counts because PostgREST/Supabase shed parallel-HEAD load when the
      // matches RLS policy chain materialised nested EXISTS joins on roles
      // even for admin callers. The RPC bypasses RLS entirely and gates on
      // is_admin() inside its body — see migrations/0100_admin_kpis_rpc.sql.
      const { data, error } = await supabase.rpc('get_admin_kpis')
      if (error) throw error
      if (!data) throw new Error('get_admin_kpis returned no data')
      setKpis(data as Kpis)
    } catch (e) {
      setErr(formatError(e))
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
