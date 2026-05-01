import { useEffect, useState } from 'react'
import { useSession } from '../../../state/useSession'
import { supabase } from '../../../lib/supabase'
import { callFunction } from '../../../lib/functions'
import LoadingSpinner from '../../../components/LoadingSpinner'
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
  const [search, setSearch] = useState('')
  const [floaters, setFloaters] = useState<FloatingHM[]>([])
  const [linked, setLinked] = useState<LinkedHM[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<Record<string, string>>({}) // hm_id → mode used

  async function load() {
    if (!session) return
    setLoading(true)
    const userEmail = session.user.email
    const { data: comp } = await supabase.from('companies').select('id').eq('primary_hr_email', userEmail).maybeSingle()
    if (!comp) { setLoading(false); return }

    // Floating HMs (no company) — visible via hm_select_hr_floating policy.
    const { data: floatData } = await supabase
      .from('hiring_managers')
      .select('id, job_title, created_at, profiles(full_name, email)')
      .is('company_id', null)
      .order('created_at', { ascending: false })
      .limit(100)

    // Pending requests this company already sent.
    const { data: pendingReqs } = await supabase
      .from('company_hm_link_requests')
      .select('hm_id')
      .eq('company_id', comp.id)
      .eq('status', 'pending')
    const pendingSet = new Set((pendingReqs ?? []).map((r) => r.hm_id))

    const enriched = ((floatData ?? []) as unknown as FloatingHM[]).map((hm) => ({
      ...hm,
      _pendingRequest: pendingSet.has(hm.id),
    }))
    setFloaters(enriched)

    // Already-linked HMs.
    const { data: linkedData } = await supabase
      .from('hiring_managers')
      .select('id, job_title, profiles(full_name, email)')
      .eq('company_id', comp.id)
      .order('created_at', { ascending: false })
    setLinked((linkedData ?? []) as unknown as LinkedHM[])

    setLoading(false)
  }

  useEffect(() => { void load() }, [session])

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

  const filtered = floaters.filter((hm) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      hm.profiles?.full_name?.toLowerCase().includes(q) ||
      hm.profiles?.email?.toLowerCase().includes(q) ||
      hm.job_title?.toLowerCase().includes(q)
    )
  })

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-8">
      {err && <Alert tone="red">{err}</Alert>}

      {/* Floating HMs — search & link */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-sm font-semibold text-gray-800">
            Unlinked hiring managers{floaters.length > 0 ? ` (${floaters.length})` : ''}
          </h2>
          <button onClick={() => void load()} className="text-xs border px-2 py-1 rounded hover:bg-gray-50">
            Refresh
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
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

        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400">No unlinked hiring managers found.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((hm) => {
              const wasDone = done[hm.id]
              return (
                <div key={hm.id} className="bg-white border rounded-lg p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {hm.profiles?.full_name ?? '(no name)'}
                    </p>
                    <p className="text-xs text-gray-500">{hm.profiles?.email ?? '—'}</p>
                    {hm.job_title && (
                      <p className="text-xs text-gray-400 mt-0.5">{hm.job_title}</p>
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
      {linked.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-800 mb-3">
            Your hiring managers ({linked.length})
          </h2>
          <div className="space-y-2">
            {linked.map((hm) => (
              <div key={hm.id} className="bg-gray-50 border rounded-lg p-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {(hm.profiles?.full_name ?? '?')[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{hm.profiles?.full_name ?? '—'}</p>
                  <p className="text-xs text-gray-500">{hm.profiles?.email ?? '—'} {hm.job_title ? `· ${hm.job_title}` : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
