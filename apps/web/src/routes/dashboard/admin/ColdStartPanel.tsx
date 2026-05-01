import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import LoadingSpinner from '../../../components/LoadingSpinner'

interface ColdStartRole {
  queue_id: string
  role_id: string
  title: string
  required_traits: string[]
  created_at: string
}
interface EligibleTalent {
  id: string
  profile_id: string
  derived_tags: Record<string, number> | null
  expected_salary_min: number | null
  expected_salary_max: number | null
}

// v4 §17: "Once total talents > 500, disable manual seeding and rely on
// algorithm." Exposed via public.active_talent_count() (see migration 0010).
const COLD_START_AUTO_SWITCH_THRESHOLD = 500

export default function ColdStartPanel() {
  const [rows, setRows] = useState<ColdStartRole[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [openRoleId, setOpenRoleId] = useState<string | null>(null)
  const [talents, setTalents] = useState<EligibleTalent[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [activeTalents, setActiveTalents] = useState<number | null>(null)

  async function reloadQueue() {
    setLoading(true)
    const [{ data, error }, { data: tc }] = await Promise.all([
      supabase
        .from('cold_start_queue')
        .select('id, role_id, status, created_at, roles(id, title, required_traits)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase.rpc('active_talent_count'),
    ])
    setActiveTalents(typeof tc === 'number' ? tc : 0)
    if (error) { setErr(error.message); setLoading(false); return }
    const mapped: ColdStartRole[] = ((data ?? []) as unknown as Array<{
      id: string
      role_id: string
      created_at: string
      roles: { title: string; required_traits: string[] } | null
    }>).map((q) => ({
      queue_id: q.id,
      role_id: q.role_id,
      title: q.roles?.title ?? '(unknown role)',
      required_traits: q.roles?.required_traits ?? [],
      created_at: q.created_at,
    }))
    setRows(mapped)
    setLoading(false)
  }

  useEffect(() => { void reloadQueue() }, [])

  async function loadTalents(roleId: string) {
    setOpenRoleId(roleId)
    setSelected(new Set())
    const { data: existing } = await supabase.from('matches').select('talent_id').eq('role_id', roleId)
    const excluded = new Set((existing ?? []).map((m) => m.talent_id))
    const { data } = await supabase
      .from('talents')
      .select('id, profile_id, derived_tags, expected_salary_min, expected_salary_max')
      .eq('is_open_to_offers', true)
      .limit(500)
    const pool = (data ?? []).filter((t) => !excluded.has(t.id)) as EligibleTalent[]
    setTalents(pool)
  }

  function toggle(talentId: string) {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(talentId)) n.delete(talentId)
      else if (n.size < 3) n.add(talentId)
      return n
    })
  }

  async function applyMatches(queueId: string, roleId: string) {
    if (selected.size === 0) return
    setBusy(true); setErr(null)
    const expiresAt = new Date(Date.now() + 5 * 86400000).toISOString()
    const insertRows = Array.from(selected).map((tid) => ({
      role_id: roleId,
      talent_id: tid,
      compatibility_score: 50,
      tag_compatibility: 50,
      life_chart_score: null,
      internal_reasoning: { source: 'admin_cold_start' },
      status: 'generated',
      expires_at: expiresAt,
    }))
    const { error: insErr } = await supabase.from('matches').insert(insertRows)
    if (insErr) { setErr(insErr.message); setBusy(false); return }
    await supabase.from('match_history').insert(
      Array.from(selected).map((tid) => ({ role_id: roleId, talent_id: tid, action: 'manual_admin' })),
    )
    await supabase.from('cold_start_queue').update({ status: 'applied' }).eq('id', queueId)
    setBusy(false); setOpenRoleId(null); setSelected(new Set())
    await reloadQueue()
  }

  if (loading) return <LoadingSpinner />

  const autoSwitchReached = (activeTalents ?? 0) >= COLD_START_AUTO_SWITCH_THRESHOLD

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Roles flagged by <code>match-generate</code> because the algorithm found
        fewer than three eligible talents. Manually pair up to 3 talents per role.
      </p>
      {activeTalents !== null && (
        <p className="text-xs text-gray-500 mb-3">
          Active talents: <strong>{activeTalents}</strong>
          {autoSwitchReached
            ? ` · Auto-switch reached (≥ ${COLD_START_AUTO_SWITCH_THRESHOLD}). Manual seeding disabled per v4 §17; the algorithm now handles matching on its own.`
            : ` · Manual seeding active (switches off at ≥ ${COLD_START_AUTO_SWITCH_THRESHOLD}).`}
        </p>
      )}
      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Cold-start queue is empty.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.queue_id} className="bg-white border rounded p-4">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold">{r.title}</div>
                  <div className="text-xs text-gray-500">
                    Traits: {r.required_traits.join(', ') || '—'} · Queued{' '}
                    {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => (openRoleId === r.role_id ? setOpenRoleId(null) : void loadTalents(r.role_id))}
                  className="text-sm text-brand-600 hover:underline disabled:text-gray-400 disabled:no-underline"
                  disabled={autoSwitchReached}
                  title={autoSwitchReached ? 'Cold-start disabled: talent pool is past the auto-switch threshold' : undefined}
                >
                  {openRoleId === r.role_id ? 'Close' : 'Pick candidates'}
                </button>
              </div>

              {openRoleId === r.role_id && (
                <div className="mt-3 border-t pt-3">
                  {talents.length === 0 ? (
                    <p className="text-xs text-gray-500">No eligible talents in the pool right now.</p>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500 mb-2">
                        Pick up to 3. {selected.size} selected.
                      </p>
                      <ul className="max-h-64 overflow-y-auto divide-y">
                        {talents.map((t) => (
                          <li key={t.id} className="py-2 flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selected.has(t.id)}
                              onChange={() => toggle(t.id)}
                              disabled={!selected.has(t.id) && selected.size >= 3}
                              aria-label={`Select talent ${t.id.slice(0, 8)}`}
                            />
                            <div className="flex-1 text-sm">
                              <div>Talent #{t.id.slice(0, 8)}</div>
                              <div className="text-xs text-gray-500">
                                Expects: RM {t.expected_salary_min ?? '—'} – {t.expected_salary_max ?? '—'} ·{' '}
                                Tags: {Object.keys(t.derived_tags ?? {}).slice(0, 4).join(', ') || '—'}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => void applyMatches(r.queue_id, r.role_id)}
                          disabled={selected.size === 0 || busy}
                          className="bg-brand-600 text-white px-3 py-1 rounded text-sm hover:bg-brand-700 disabled:bg-gray-300"
                        >
                          {busy ? 'Applying…' : `Apply ${selected.size} match${selected.size === 1 ? '' : 'es'}`}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
