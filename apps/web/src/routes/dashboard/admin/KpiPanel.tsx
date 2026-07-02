import { getAdminKpis } from '../../../data/repositories/admin'
import { formatError } from '../../../lib/errors'
import { readDashCache, writeDashCache } from '../../../lib/dashboardCache'
import { useQuery } from '../../../lib/useQuery'
import Skeleton from '../../../components/Skeleton'

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

// F1 fix — single SECURITY DEFINER RPC replaces 14 parallel head+count
// queries. The old pattern was returning 503 across all matches/profiles
// counts because PostgREST/Supabase shed parallel-HEAD load when the
// matches RLS policy chain materialised nested EXISTS joins on roles
// even for admin callers. The RPC bypasses RLS entirely and gates on
// is_admin() inside its body — see migrations/0100_admin_kpis_rpc.sql.
async function fetchKpis(): Promise<Kpis> {
  const { data, error } = await getAdminKpis()
  if (error) throw error
  if (!data) throw new Error('get_admin_kpis returned no data')
  return data as Kpis
}

export default function KpiPanel() {
  // SWR seam: dedup + stale-while-revalidate + focus refetch for free.
  // `fallbackData` hydrates from the local cache so admins re-opening /admin
  // see numbers instantly; the live refresh runs in the background and swaps
  // in fresh data. `onSuccess` keeps that local snapshot warm for next visit.
  const { data: kpis, error: rawErr, mutate } = useQuery<Kpis>(
    'admin-kpis',
    fetchKpis,
    {
      fallbackData: readDashCache<Kpis>('admin_kpi') ?? undefined,
      onSuccess: (fresh) => writeDashCache<Kpis>('admin_kpi', undefined, fresh),
    },
  )
  const err = rawErr ? formatError(rawErr) : null
  const load = () => { void mutate() }

  // Error only blocks if we don't even have a cached snapshot to render.
  if (err && !kpis) return <p className="text-sm text-red-600">{err}</p>

  // While fresh data is on the wire and we have no cache, show a skeleton
  // version of the KPI grid (same structure, shimmer in place of numbers).
  const skel = <Skeleton width={56} height={28} />

  const expiry_rate = kpis && kpis.total_matches > 0
    ? kpis.by_status['expired'] / kpis.total_matches
    : null
  const ghost_rate = kpis && kpis.total_users > 0
    ? kpis.ghost_users / kpis.total_users
    : null

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">Live platform metrics. All counts are exact, computed at load time.</p>
        <button onClick={() => load()} className="border dark:border-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Active matches" value={kpis ? (
          kpis.by_status['generated'] + kpis.by_status['viewed'] +
          kpis.by_status['accepted_by_talent'] + kpis.by_status['invited_by_manager'] +
          kpis.by_status['hr_scheduling'] + kpis.by_status['interview_scheduled']
        ) : skel} />
        <Stat label="Hired" value={kpis ? kpis.by_status['hired'] : skel} />
        <Stat label="Expired" value={kpis ? kpis.by_status['expired'] : skel} />
        <Stat label="Total matches (all time)" value={kpis ? kpis.total_matches : skel} />

        <Stat label="Active talents" value={kpis ? kpis.active_talents : skel} />
        <Stat label="Active roles" value={kpis ? kpis.active_roles : skel} />
        <Stat label="Verified companies" value={kpis ? kpis.companies_verified : skel} />
        <Stat label="Pending verification" value={kpis ? kpis.companies_pending : skel} highlight={(kpis?.companies_pending ?? 0) > 0} />

        <Stat label="Total users" value={kpis ? kpis.total_users : skel} />
        <Stat label="Banned users" value={kpis ? kpis.banned_users : skel} highlight={(kpis?.banned_users ?? 0) > 0} />
        <Stat label="Ghosting users (≥3)" value={kpis ? kpis.ghost_users : skel} highlight={(kpis?.ghost_users ?? 0) > 0} />
        <Stat label="Waitlist pending" value={kpis ? kpis.waitlist_pending : skel} highlight={(kpis?.waitlist_pending ?? 0) > 0} />
      </div>

      <h3 className="font-semibold text-sm mb-3 dark:text-white">Rates</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Rate label="Match expiry rate"      value={expiry_rate} hint="expired / total matches" />
        <Rate label="Ghosting rate"          value={ghost_rate}  hint="ghost_score ≥ 3 / all users" />
        <Rate label="Interview → hire rate"  value={kpis?.interview_hire_rate ?? null}
              hint={kpis == null ? '…' : kpis.interview_hire_rate === null ? 'no interviews yet' : 'hired / (completed + hired)'} />
      </div>

      <h3 className="font-semibold text-sm mb-3 dark:text-white">Latency</h3>
      <div className="grid grid-cols-1 gap-3 mb-6">
        <Stat
          label="Avg. time to first view (last 200 viewed matches)"
          value={kpis == null ? skel : kpis.avg_hours_to_first_view === null ? '—' : `${kpis.avg_hours_to_first_view.toFixed(1)} h`}
        />
      </div>

      <h3 className="font-semibold text-sm mb-3 dark:text-white">Matches by status</h3>
      <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded p-4">
        <table className="w-full text-sm">
          <tbody>
            {TRACKED_STATUSES.map((s) => (
              <tr key={s} className="border-b dark:border-gray-700 last:border-0">
                <td className="py-1.5 capitalize text-gray-700 dark:text-gray-300">{s.replace(/_/g, ' ')}</td>
                <td className="py-1.5 text-right font-mono dark:text-gray-300">{kpis ? kpis.by_status[s] : <Skeleton width={32} height={12} rounded="sm" />}</td>
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
}: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`bg-white dark:bg-gray-800 border dark:border-gray-700 rounded p-3 ${highlight ? 'border-amber-300' : ''}`}>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`text-2xl font-semibold ${highlight ? 'text-amber-700 dark:text-amber-500' : 'dark:text-white'}`}>{value}</div>
    </div>
  )
}

function Rate({ label, value, hint }: { label: string; value: number | null; hint: string }) {
  const pct = value === null
    ? <Skeleton width={56} height={28} />
    : `${(value * 100).toFixed(1)}%`
  return (
    <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded p-3">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-2xl font-semibold dark:text-white">{pct}</div>
      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{hint}</div>
    </div>
  )
}
