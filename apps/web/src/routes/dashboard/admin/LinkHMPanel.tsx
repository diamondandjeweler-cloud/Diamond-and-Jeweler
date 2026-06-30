import { useEffect, useState } from 'react'
import { useSession } from '../../../state/useSession'
import { companyIdByPrimaryHrEmail } from '../../../data/repositories/companies'
import { floatingHms, linkedHmsForCompany } from '../../../data/repositories/hiring-managers'
import { pendingLinkRequestHmIdsForCompany } from '../../../data/repositories/company-hm-link-requests'
import { callFunction } from '../../../lib/functions'
import ListSkeleton from '../../../components/ListSkeleton'
import { Button, Alert, Input } from '../../../components/ui'

interface FloatingHM {
  id: string
  job_title: string | null
  created_at: string
  profiles: { full_name: string; email: string } | null
  _pendingRequest?: boolean
}

interface LinkedHM {
  id: string
  job_title: string | null
  profiles: { full_name: string; email: string } | null
}

export default function LinkHMPanel() {
  const { session } = useSession()
  const userId = session?.user.id
  const userEmail = session?.user.email ?? null
  const [search, setSearch] = useState('')
  const [floaters, setFloaters] = useState<FloatingHM[] | null>(null)
  const [linked, setLinked] = useState<LinkedHM[] | null>(null)
  // `loading` kept as a no-op so existing setLoading() call sites don't need
  // structural changes; render path now drives off `floaters == null` etc.
  const setLoading = (_v: boolean) => { /* no-op */ }
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<Record<string, string>>({}) // hm_id → mode used

  async function load() {
    if (!userId || !userEmail) { setFloaters([]); setLinked([]); setLoading(false); return }
    setLoading(true)
    try {
      const { data: comp } = await companyIdByPrimaryHrEmail(userEmail).maybeSingle()
      if (!comp) { setFloaters([]); setLinked([]); setLoading(false); return }

      // Floating HMs (no company) — visible via hm_select_hr_floating policy.
      const { data: floatData } = await floatingHms()

      // Pending requests this company already sent.
      const { data: pendingReqs } = await pendingLinkRequestHmIdsForCompany(comp.id)
      const pendingSet = new Set((pendingReqs ?? []).map((r) => r.hm_id))

      const enriched = ((floatData ?? []) as unknown as FloatingHM[]).map((hm) => ({
        ...hm,
        _pendingRequest: pendingSet.has(hm.id),
      }))
      setFloaters(enriched)

      // Already-linked HMs.
      const { data: linkedData } = await linkedHmsForCompany(comp.id)
      setLinked((linkedData ?? []) as unknown as LinkedHM[])

      setLoading(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Load failed')
      setFloaters((cur) => cur ?? [])
      setLinked((cur) => cur ?? [])
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [userId, userEmail])

  async function sendRequest(hmId: string, mode: 'request' | 'direct') {
    setBusy(hmId + mode)
    setErr(null)
    try {
      await callFunction('link-hm', { hm_id: hmId, mode })
      setDone((prev) => ({ ...prev, [hmId]: mode }))
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
    setBusy(null)
  }

  const filtered = (floaters ?? []).filter((hm) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      hm.profiles?.full_name?.toLowerCase().includes(q) ||
      hm.profiles?.email?.toLowerCase().includes(q) ||
      hm.job_title?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-8">
      {err && <Alert tone="red">{err}</Alert>}

      {/* Floating HMs — search & link */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Unlinked hiring managers{(floaters?.length ?? 0) > 0 ? ` (${floaters!.length})` : ''}
          </h2>
          <button onClick={() => void load()} className="text-xs border dark:border-gray-700 px-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300">
            Refresh
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          These hiring managers signed up independently and have no company yet.
          Send a request (they must accept) or directly link them to your company.
        </p>

        <div className="mb-4">
          <Input
            placeholder="Search by name, email or job title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {floaters == null ? (
          <ListSkeleton rows={3} variant="row" />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">No unlinked hiring managers found.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((hm) => {
              const wasDone = done[hm.id]
              return (
                <div key={hm.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {hm.profiles?.full_name ?? '(no name)'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{hm.profiles?.email ?? '—'}</p>
                    {hm.job_title && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{hm.job_title}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {wasDone ? (
                      <span className="text-xs text-green-600 font-medium">
                        {wasDone === 'direct' ? 'Linked ✓' : 'Request sent ✓'}
                      </span>
                    ) : hm._pendingRequest ? (
                      <span className="text-xs text-amber-600 font-medium">Request pending…</span>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy !== null}
                          loading={busy === hm.id + 'request'}
                          onClick={() => void sendRequest(hm.id, 'request')}
                        >
                          Send request
                        </Button>
                        <Button
                          size="sm"
                          disabled={busy !== null}
                          loading={busy === hm.id + 'direct'}
                          onClick={() => void sendRequest(hm.id, 'direct')}
                        >
                          Direct link
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Already-linked HMs */}
      {(linked?.length ?? 0) > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
            Your hiring managers ({linked!.length})
          </h2>
          <div className="space-y-2">
            {linked!.map((hm) => (
              <div key={hm.id} className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {(hm.profiles?.full_name ?? '?')[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{hm.profiles?.full_name ?? '—'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{hm.profiles?.email ?? '—'} {hm.job_title ? `· ${hm.job_title}` : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
