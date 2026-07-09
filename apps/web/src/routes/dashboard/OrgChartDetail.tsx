import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { useShallow } from 'zustand/react/shallow'
import { getOrgConsultationById, updateOrgConsultation } from '../../data/repositories/orgConsultations'
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Textarea } from '../../components/ui'
import { confirmDialog } from '../../components/Modal'
import { useSeo } from '../../lib/useSeo'
import {
  type OrgConsultationRow, type OrgMember,
  orgArchetypeLabel, runAnalysis,
} from '../../shared/domain/orgChart/orgChart'
import { sanitiseClientText } from '../../shared/domain/orgChart/orgChartSanitiser'

type EditingMember = OrgMember & { _editIdx: number }

const blankMember = (): EditingMember => ({
  _editIdx: -1,
  name: '',
  current_role: '',
  dob: '',
  dob_time: '',
  dob_city: '',
  gender: '',
  archetype_code: null,
  suggested_role: null,
  fit_score: null,
  notes: '',
})

export default function OrgChartDetail() {
  const { id: idStr } = useParams<{ id: string }>()
  const id = Number(idStr)
  useSeo({ title: 'Org Chart Consultation', noindex: true })
  const { session } = useSession(useShallow((s) => ({ session: s.session })))

  const [row, setRow] = useState<OrgConsultationRow | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [memberDraft, setMemberDraft] = useState<EditingMember | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkCsv, setBulkCsv] = useState('')
  const [notes, setNotes] = useState('')
  const [showReport, setShowReport] = useState(false)

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return
    const { data, error } = await getOrgConsultationById(id)
    if (error) { setErr(error.message); return }
    setRow(data as unknown as OrgConsultationRow)
    setNotes(data?.consultant_notes ?? '')
  }, [id])

  useEffect(() => { if (session?.user.id) void load() }, [session?.user.id, load])

  const members: OrgMember[] = row?.members ?? []
  const analysisDone = members.length > 0 && members.every(m => m.archetype_code)
  const reportReady = !!row?.report_html

  const cap = row?.team_size ?? 0

  async function patch(updates: Partial<OrgConsultationRow>) {
    if (!row) return
    setBusy(true); setErr(null)
    const { error } = await updateOrgConsultation(row.id, updates)
    setBusy(false)
    if (error) { setErr(error.message); return }
    await load()
  }

  function openAdd() { setMemberDraft(blankMember()) }
  function openEdit(idx: number) {
    const m = members[idx]
    if (!m) return
    setMemberDraft({ ...blankMember(), ...m, _editIdx: idx })
  }
  async function saveMember() {
    if (!memberDraft || !row) return
    if (!memberDraft.name.trim()) { setErr('Name is required.'); return }
    const next = [...members]
    const cleaned: OrgMember = {
      name: memberDraft.name.trim(),
      current_role: memberDraft.current_role.trim(),
      dob: memberDraft.dob,
      dob_time: memberDraft.dob_time || '',
      dob_city: (memberDraft.dob_city || '').trim(),
      gender: memberDraft.gender,
      // any roster edit invalidates prior compute for that member
      archetype_code: null,
      suggested_role: null,
      fit_score: null,
      notes: memberDraft.notes || '',
    }
    if (memberDraft._editIdx >= 0) {
      next[memberDraft._editIdx] = cleaned
    } else {
      if (next.length >= cap) { setErr(`Team size cap reached (${cap}).`); return }
      next.push(cleaned)
    }
    setMemberDraft(null)
    await patch({ members: next, status: 'collecting' })
  }
  async function removeMember(idx: number) {
    if (!row) return
    if (!(await confirmDialog({
      title: 'Remove this member?',
      message: 'This removes the member from the roster.',
      confirmLabel: 'Remove',
      tone: 'danger',
    }))) return
    const next = members.slice()
    next.splice(idx, 1)
    await patch({ members: next })
  }

  async function importBulk() {
    if (!row) return
    const lines = bulkCsv.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) { setErr('Paste at least one row.'); return }
    const next = members.slice()
    let added = 0
    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim())
      const name = parts[0]
      if (!name) continue
      if (next.length >= cap) break
      next.push({
        name,
        current_role: parts[1] || '',
        dob: parts[2] || '',
        dob_time: '',
        dob_city: '',
        gender: ((parts[3] || '').toLowerCase() === 'female' ? 'female' : (parts[3] || '').toLowerCase() === 'male' ? 'male' : ''),
        archetype_code: null,
        suggested_role: null,
        fit_score: null,
        notes: '',
      })
      added++
    }
    setBulkCsv(''); setBulkOpen(false)
    if (added > 0) await patch({ members: next, status: 'collecting' })
  }

  async function runComputeAndSave() {
    if (!row || !members.length) return
    const { members: m2, pairs, analysis } = runAnalysis(members)
    await patch({ members: m2, pairs, analysis, status: 'analyzing' })
  }

  async function generateReport() {
    if (!row) return
    const a = row.analysis ?? {}
    const memberRows = members.map(m => `
      <tr style="border-top:1px solid #e5e7eb;">
        <td style="padding:10px;"><strong>${escapeHtml(m.name)}</strong><div style="font-size:11px;color:#6b7280;">${escapeHtml(m.current_role || '')}</div></td>
        <td style="padding:10px;">${escapeHtml(orgArchetypeLabel(m.archetype_code))}</td>
        <td style="padding:10px;font-weight:600;color:#16a34a;">${m.fit_score ?? ''}</td>
      </tr>
    `).join('')
    const leadershipNames = (a.leadership_cluster ?? [])
      .map(idx => members[idx]?.name)
      .filter(Boolean)
    const conflictRows = (a.conflict_pairs ?? []).map(c =>
      `<li>${escapeHtml(members[c.a]?.name || '')} ↔ ${escapeHtml(members[c.b]?.name || '')} — coach communication style</li>`
    ).join('') || '<li>No high-friction pairs detected.</li>'
    const missingList = (a.missing_archetypes ?? [])
      .map(code => orgArchetypeLabel(code))
      .map(label => `<li>${escapeHtml(label)}</li>`).join('')
      || '<li>All key archetypes are represented.</li>'

    const rawHtml = `
      <div style="font-family:'Inter Variable',Inter,sans-serif;max-width:800px;color:#1f2937;">
        <div style="background:linear-gradient(135deg,#0F4C81,#1d6fb8);color:#fff;padding:24px;border-radius:8px;">
          <h1 style="margin:0;">Organisational Restructure Report</h1>
          <div style="opacity:.9;margin-top:6px;">Prepared for ${escapeHtml(row.client_company)} · ${new Date().toLocaleDateString()}</div>
        </div>
        <div style="padding:24px 8px;">
          <h2>Executive Summary</h2>
          <p>${escapeHtml(a.overall_summary ?? '')}</p>
          <h2>Recommended Leadership Cluster</h2>
          <p>${leadershipNames.length ? leadershipNames.map(escapeHtml).join(', ') : 'No clear leadership cluster — recommend external hire or development plan.'}</p>
          <h2>Role-Fit Assessment</h2>
          <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:6px;">
            <thead style="background:#f9fafb;text-align:left;"><tr><th style="padding:10px;">Member</th><th style="padding:10px;">Suggested Role</th><th style="padding:10px;">Fit</th></tr></thead>
            <tbody>${memberRows}</tbody>
          </table>
          <h2>Friction Pairs To Coach</h2>
          <ul>${conflictRows}</ul>
          <h2>Capability Gaps</h2>
          <ul>${missingList}</ul>
          <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb;">
          <p style="font-size:11px;color:#6b7280;">Report generated by Diamond &amp; Jeweler · Confidential · For internal use of ${escapeHtml(row.client_company)} only.</p>
        </div>
      </div>
    `
    const report = sanitiseClientText(rawHtml)
    await patch({
      report_html: report,
      report_generated_at: new Date().toISOString(),
      status: 'completed',
    })
  }

  async function markPaid() {
    await patch({ payment_status: 'paid', payment_received_at: new Date().toISOString() })
  }

  async function saveNotes() {
    await patch({ consultant_notes: notes })
  }

  const headerActions = useMemo(() => (
    <Link to="/hm/org-chart">
      <Button variant="secondary" size="sm">← Back to list</Button>
    </Link>
  ), [])

  if (!Number.isFinite(id)) return <div className="p-8">Invalid consultation id.</div>
  if (!row) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <PageHeader title="Org Chart Consultation" actions={headerActions} />
        {err
          ? <Alert tone="red">{err}</Alert>
          : <div className="rounded-lg border border-ink-100 bg-white p-8 text-center text-ink-500">Loading…</div>}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader title={row.client_company} description="Org Chart Consultation" actions={headerActions} />

      {err && (
        <div className="mb-4">
          <Alert tone="red">{err}</Alert>
        </div>
      )}

      {/* Header card: pricing + payment */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div>
            <div className="text-sm text-ink-500">
              {[row.client_contact_name, row.client_contact_phone, row.client_industry].filter(Boolean).join(' · ') || '—'}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone="gray">{row.status}</Badge>
              <Badge tone={row.payment_status === 'paid' ? 'green' : row.payment_status === 'unpaid' ? 'red' : 'gray'}>
                {row.payment_status}
              </Badge>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-brand-700">RM {Number(row.price_myr).toLocaleString()}</div>
            <div className="text-xs text-ink-500">Team size: {row.team_size} pax · {row.tier_code}</div>
            {row.payment_status !== 'paid' && (
              <div className="mt-2">
                <Button size="sm" onClick={markPaid} disabled={busy}>Mark Paid</Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Members */}
      <Card className="mb-4">
        <div className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold">
              Team Members <span className="font-normal text-ink-500">({members.length} / {row.team_size})</span>
            </h3>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setBulkOpen(true)}>Bulk Paste</Button>
              <Button size="sm" onClick={openAdd} disabled={members.length >= cap}>+ Add Member</Button>
            </div>
          </div>

          {members.length === 0 ? (
            <div className="rounded border border-dashed border-ink-200 p-6 text-center text-sm text-ink-500">
              No members yet. Add team members one by one or paste a CSV.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-ink-50 text-ink-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Current Role</th>
                    <th className="px-3 py-2 font-medium">DOB</th>
                    <th className="px-3 py-2 font-medium">Suggested Role</th>
                    <th className="px-3 py-2 font-medium">Fit</th>
                    <th className="px-3 py-2 font-medium text-right" />
                  </tr>
                </thead>
                <tbody>
                  {members.map((m, i) => (
                    <tr key={i} className="border-t border-ink-100">
                      <td className="px-3 py-2 font-medium">{m.name || '—'}</td>
                      <td className="px-3 py-2 text-ink-700">{m.current_role || '—'}</td>
                      <td className="px-3 py-2 text-xs text-ink-500">{m.dob || '—'}</td>
                      <td className="px-3 py-2">{orgArchetypeLabel(m.archetype_code) || '—'}</td>
                      <td className="px-3 py-2">
                        {m.fit_score
                          ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">{m.fit_score}</span>
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(i)} className="mr-2">Edit</Button>
                        <Button size="sm" variant="secondary" onClick={() => removeMember(i)}>×</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* Analysis */}
      {members.length > 0 && (
        <Card className="mb-4">
          <div className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">Analysis</h3>
              <Button onClick={runComputeAndSave} disabled={busy}>
                {analysisDone ? 'Re-run' : 'Run'} Analysis
              </Button>
            </div>
            {analysisDone && row.analysis?.overall_summary ? (
              <div className="rounded bg-ink-50 p-3 text-sm">{row.analysis.overall_summary}</div>
            ) : (
              <div className="text-sm text-ink-500">
                {analysisDone ? 'Analysis complete. Re-run if members change.' : 'Run analysis once all members have DOBs filled in.'}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Report */}
      {analysisDone && (
        <Card className="mb-4">
          <div className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">Client-facing Report</h3>
              <div className="flex gap-2">
                <Button onClick={generateReport} disabled={busy}>{reportReady ? 'Regenerate' : 'Generate'} Report</Button>
                {reportReady && <Button variant="secondary" onClick={() => setShowReport(true)}>Preview</Button>}
              </div>
            </div>
            <div className="text-sm text-ink-500">
              {reportReady
                ? 'Report ready. All client-facing copy is sanitised — no internal terminology surfaces.'
                : 'Click Generate to produce the deliverable.'}
            </div>
          </div>
        </Card>
      )}

      {/* Internal notes */}
      <Card>
        <div className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-base font-semibold">Internal Notes</h3>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">consultant-only</span>
          </div>
          <Textarea
            rows={4}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Raw notes — internal use only. Never shown to client."
          />
          <div className="mt-2 text-right">
            <Button size="sm" onClick={saveNotes} disabled={busy}>Save Notes</Button>
          </div>
        </div>
      </Card>

      {/* Add/Edit member modal */}
      {memberDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">
              {memberDraft._editIdx >= 0 ? 'Edit Team Member' : 'Add Team Member'}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full Name *">
                <Input value={memberDraft.name} onChange={e => setMemberDraft({ ...memberDraft, name: e.target.value })} />
              </Field>
              <Field label="Current Role">
                <Input value={memberDraft.current_role} onChange={e => setMemberDraft({ ...memberDraft, current_role: e.target.value })} />
              </Field>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Date of Birth">
                <Input type="date" value={memberDraft.dob} onChange={e => setMemberDraft({ ...memberDraft, dob: e.target.value })} />
              </Field>
              <Field label="Time (optional)">
                <Input type="time" value={memberDraft.dob_time ?? ''} onChange={e => setMemberDraft({ ...memberDraft, dob_time: e.target.value })} />
              </Field>
              <Field label="Gender">
                <Select value={memberDraft.gender ?? ''} onChange={e => setMemberDraft({ ...memberDraft, gender: e.target.value as '' | 'male' | 'female' })}>
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </Select>
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Birth City (optional)">
                <Input value={memberDraft.dob_city ?? ''} onChange={e => setMemberDraft({ ...memberDraft, dob_city: e.target.value })} />
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMemberDraft(null)}>Cancel</Button>
              <Button onClick={saveMember}>{memberDraft._editIdx >= 0 ? 'Update' : 'Add'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk paste modal */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl">
            <h3 className="mb-3 text-lg font-semibold">Bulk Paste Members</h3>
            <p className="mb-3 text-sm text-ink-600">
              Paste CSV: <code>Name, Role, DOB (YYYY-MM-DD), Gender</code> — one per line.
            </p>
            <Textarea rows={10} value={bulkCsv} onChange={e => setBulkCsv(e.target.value)} placeholder={'Ali bin Abu, Sales Lead, 1985-03-12, male\nSiti Aminah, HR Manager, 1990-07-25, female'} />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setBulkOpen(false)}>Cancel</Button>
              <Button onClick={importBulk}>Import</Button>
            </div>
          </div>
        </div>
      )}

      {/* Report preview modal */}
      {showReport && row.report_html && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Client-facing Report Preview</h3>
              <Button variant="secondary" size="sm" onClick={() => setShowReport(false)}>Close</Button>
            </div>
            <div className="max-h-[70vh] overflow-auto" dangerouslySetInnerHTML={{ __html: row.report_html }} />
          </div>
        </div>
      )}
    </div>
  )
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
