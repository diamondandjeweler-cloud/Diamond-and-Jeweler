import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '../state/useSession'
import { supabase } from '../lib/supabase'
import LoadingSpinner from '../components/LoadingSpinner'

type RequestType = 'access' | 'correction' | 'deletion' | 'portability'

type CorrectionField =
  | 'profiles.full_name'
  | 'profiles.phone'
  | 'talents.expected_salary_min'
  | 'talents.expected_salary_max'
  | 'talents.is_open_to_offers'
  | 'talents.privacy_mode'
  | 'hiring_managers.job_title'

interface CorrectionItem { field: CorrectionField; new_value: string }

interface DsrRow {
  id: string
  request_type: RequestType
  status: string
  notes: string | null
  correction_proposal: { items?: CorrectionItem[] } | null
  resolved_at: string | null
  created_at: string
}

interface AuditRow {
  id: string
  actor_role: string
  action: string
  resource_type: string | null
  created_at: string
}

const CORRECTION_FIELDS: Array<{ field: CorrectionField; label: string; kind: 'text' | 'number' | 'bool' | 'privacy' }> = [
  { field: 'profiles.full_name',            label: 'Full name',                 kind: 'text' },
  { field: 'profiles.phone',                label: 'Phone number',              kind: 'text' },
  { field: 'talents.expected_salary_min',   label: 'Expected salary (min, RM)', kind: 'number' },
  { field: 'talents.expected_salary_max',   label: 'Expected salary (max, RM)', kind: 'number' },
  { field: 'talents.is_open_to_offers',     label: 'Open to offers (true/false)', kind: 'bool' },
  { field: 'talents.privacy_mode',          label: 'Privacy mode (public/anonymous/whitelist)', kind: 'privacy' },
  { field: 'hiring_managers.job_title',     label: 'Hiring-manager job title',  kind: 'text' },
]

export default function DataRequests() {
  const { t } = useTranslation()
  const { session } = useSession()
  const navigate = useNavigate()

  const [tab, setTab] = useState<'requests' | 'access-log'>('requests')
  const [history, setHistory] = useState<DsrRow[]>([])
  const [auditLog, setAuditLog] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)

  const [requestType, setRequestType] = useState<RequestType>('access')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<CorrectionItem[]>([{ field: 'profiles.full_name', new_value: '' }])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!session) { navigate('/login'); return }
    let cancelled = false
    void (async () => {
      const [dsrRes, auditRes] = await Promise.all([
        supabase
          .from('data_requests')
          .select('id, request_type, status, notes, correction_proposal, resolved_at, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('audit_log')
          .select('id, actor_role, action, resource_type, created_at')
          .eq('subject_id', session!.user.id)
          .in('action', ['admin_profile_view', 'admin_talent_view', 'admin_file_view', 'dsr_completed', 'dsr_export_downloaded', 'file_viewed'])
          .order('created_at', { ascending: false })
          .limit(100),
      ])
      if (!cancelled) {
        setHistory((dsrRes.data ?? []) as DsrRow[])
        setAuditLog((auditRes.data ?? []) as AuditRow[])
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [session, navigate])

  function addItem() {
    setItems((xs) => [...xs, { field: 'profiles.full_name', new_value: '' }])
  }
  function removeItem(idx: number) {
    setItems((xs) => xs.filter((_, i) => i !== idx))
  }
  function setItem(idx: number, patch: Partial<CorrectionItem>) {
    setItems((xs) => xs.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!session) return
    setErr(null)

    if (requestType === 'deletion') {
      const ok = confirm(
        'Deletion is permanent. We purge sensitive data 30 days after your request is approved. Continue?',
      )
      if (!ok) return
    }

    // For correction, coerce values into their typed form before submitting.
    let correction_proposal: { items: CorrectionItem[] } | null = null
    if (requestType === 'correction') {
      const clean: CorrectionItem[] = []
      for (const it of items) {
        const spec = CORRECTION_FIELDS.find((f) => f.field === it.field)
        if (!spec) continue
        const raw = it.new_value.trim()
        if (!raw) { setErr(`Enter a value for ${spec.label}.`); return }
        let parsed: unknown = raw
        if (spec.kind === 'number') {
          const n = Number(raw)
          if (!Number.isFinite(n) || n < 0) { setErr(`${spec.label} must be a non-negative number.`); return }
          parsed = Math.round(n)
        } else if (spec.kind === 'bool') {
          if (raw !== 'true' && raw !== 'false') { setErr(`${spec.label} must be true or false.`); return }
          parsed = raw === 'true'
        } else if (spec.kind === 'privacy') {
          if (!['public', 'anonymous', 'whitelist'].includes(raw)) {
            setErr(`${spec.label} must be public, anonymous, or whitelist.`); return
          }
        }
        clean.push({ field: it.field, new_value: parsed as string })
      }
      if (clean.length === 0) { setErr('Add at least one correction.'); return }
      correction_proposal = { items: clean }
    }

    setBusy(true)
    const { data, error } = await supabase
      .from('data_requests')
      .insert({
        user_id: session.user.id,
        request_type: requestType,
        notes: notes || null,
        correction_proposal,
      })
      .select()
      .single()
    setBusy(false)
    if (error) { setErr(error.message); return }
    setHistory((xs) => [data as DsrRow, ...xs])
    setSubmitted(true)
    setNotes('')
    setItems([{ field: 'profiles.full_name', new_value: '' }])
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white border rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-2">{t('data.title')}</h1>
        <p className="text-sm text-gray-600 mb-6">
          {t('data.intro')}{' '}
          <Link to="/privacy" className="text-brand-600 underline">{t('data.introLink')}</Link>{' '}
          {t('data.introTail')}
        </p>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-6 border-b">
          <button
            type="button"
            onClick={() => setTab('requests')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'requests' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            {t('data.tabRequests')}
          </button>
          <button
            type="button"
            onClick={() => setTab('access-log')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'access-log' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            {t('data.tabAccessLog')}
          </button>
        </div>

        {tab === 'access-log' && (
          <div>
            <p className="text-sm text-gray-600 mb-4">{t('data.accessLogIntro')}</p>
            {auditLog.length === 0 ? (
              <p className="text-sm text-gray-500">{t('data.noAccessLog')}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 border-b">
                    <th className="py-2 pr-3">Date / Time</th>
                    <th className="pr-3">Action</th>
                    <th className="pr-3">Resource</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-500">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                      <td className="pr-3 capitalize">{row.action.replace(/_/g, ' ')}</td>
                      <td className="pr-3 text-gray-500">{row.resource_type ?? '—'}</td>
                      <td className="capitalize text-gray-500">{row.actor_role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'requests' && submitted && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded px-3 py-2 mb-4 text-sm">
            {t('data.submitted')} ✓
          </div>
        )}

        {tab === 'requests' && <form onSubmit={submit} className="space-y-4 mb-8">
          <div>
            <label htmlFor="req-type" className="block text-sm mb-1">{t('data.type')}</label>
            <select
              id="req-type"
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as RequestType)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="access">{t('data.typeAccess')}</option>
              <option value="correction">{t('data.typeCorrect')}</option>
              <option value="portability">{t('data.typePort')}</option>
              <option value="deletion">{t('data.typeDelete')}</option>
            </select>
          </div>

          {requestType === 'correction' && (
            <div className="border rounded p-3 bg-gray-50 space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-sm font-medium">{t('data.fieldsToFix')}</p>
                <button
                  type="button"
                  onClick={addItem}
                  className="text-xs text-brand-600 hover:underline"
                >
                  {t('data.addField')}
                </button>
              </div>
              {items.map((it, idx) => {
                const spec = CORRECTION_FIELDS.find((f) => f.field === it.field)
                return (
                  <div key={idx} className="flex gap-2 items-start">
                    <select
                      value={it.field}
                      onChange={(e) => setItem(idx, { field: e.target.value as CorrectionField })}
                      className="border rounded px-2 py-1.5 text-sm flex-1"
                      aria-label={`Field for correction ${idx + 1}`}
                    >
                      {CORRECTION_FIELDS.map((f) => (
                        <option key={f.field} value={f.field}>{f.label}</option>
                      ))}
                    </select>
                    <input
                      value={it.new_value}
                      onChange={(e) => setItem(idx, { new_value: e.target.value })}
                      placeholder={
                        spec?.kind === 'bool' ? 'true or false'
                        : spec?.kind === 'number' ? 'number'
                        : spec?.kind === 'privacy' ? 'public | anonymous | whitelist'
                        : 'new value'
                      }
                      className="border rounded px-2 py-1.5 text-sm flex-1"
                      aria-label={`New value for correction ${idx + 1}`}
                    />
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="text-xs text-red-600 hover:underline px-2 py-1.5"
                      >
                        {t('data.remove')}
                      </button>
                    )}
                  </div>
                )
              })}
              <p className="text-xs text-gray-500">
                Admin reviews each correction before it's applied. Requests outside this list require email.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="req-notes" className="block text-sm mb-1">{t('data.notes')}</label>
            <textarea
              id="req-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}

          <button
            type="submit"
            disabled={busy}
            className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700 disabled:bg-gray-300"
          >
            {busy ? t('common.submitting') : t('data.submit')}
          </button>
        </form>}

        {tab === 'requests' && (
          <>
            <h2 className="font-semibold mb-3">{t('data.history')}</h2>
            {history.length === 0 ? (
              <p className="text-sm text-gray-500">{t('data.noRequests')}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 border-b">
                    <th className="py-2">Type</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Resolved</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 capitalize">{r.request_type}</td>
                      <td className="capitalize">{r.status.replace('_', ' ')}</td>
                      <td>{new Date(r.created_at).toLocaleDateString()}</td>
                      <td>{r.resolved_at ? new Date(r.resolved_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  )
}
