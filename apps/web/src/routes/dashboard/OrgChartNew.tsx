import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { useShallow } from 'zustand/react/shallow'
import { insertOrgConsultation } from '../../data/repositories/orgConsultations'
import { Alert, Button, Card, Field, Input, PageHeader } from '../../components/ui'
import { useSeo } from '../../lib/useSeo'
import { ORG_TIERS, orgTierForSize } from '../../shared/domain/orgChart/orgChart'

export default function OrgChartNew() {
  useSeo({ title: 'New Org Chart Consultation', noindex: true })
  const { session } = useSession(useShallow((s) => ({ session: s.session })))
  const navigate = useNavigate()

  const [company, setCompany] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [industry, setIndustry] = useState('')
  const [teamSize, setTeamSize] = useState(5)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const tier = useMemo(() => orgTierForSize(teamSize), [teamSize])

  async function submit() {
    setErr(null)
    if (!company.trim()) { setErr('Client company is required.'); return }
    if (!tier) { setErr('Team size must be between 1 and 50.'); return }

    setBusy(true)
    const { data, error } = await insertOrgConsultation({
      client_company: company.trim(),
      client_contact_name: contactName.trim() || null,
      client_contact_phone: contactPhone.trim() || null,
      client_contact_email: contactEmail.trim() || null,
      client_industry: industry.trim() || null,
      team_size: teamSize,
      tier_code: tier.code,
      price_myr: tier.price,
      payment_status: 'unpaid',
      status: 'collecting',
      members: [],
      pairs: [],
      analysis: {},
      // consultant_id/created_by left null — UUID profile linkage handled in a follow-up migration
    })
    setBusy(false)

    if (error) { setErr(error.message); return }
    if (data?.id) navigate(`/hm/org-chart/${data.id}`)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PageHeader title="New Org Chart Consultation" description="Add the client company, choose team size, and you'll be auto-priced." />

      {err && (
        <div className="mb-4">
          <Alert tone="red">{err}</Alert>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <Card>
          <div className="space-y-4 p-5">
            <Field label="Client Company *">
              <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="ABC Sdn Bhd" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact Name">
                <Input value={contactName} onChange={e => setContactName(e.target.value)} />
              </Field>
              <Field label="Contact Phone">
                <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact Email">
                <Input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
              </Field>
              <Field label="Industry">
                <Input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="e.g. F&B, retail" />
              </Field>
            </div>

            <Field label="Team Size (1–50 pax) *">
              <Input
                type="number"
                min={1}
                max={50}
                value={teamSize}
                onChange={e => setTeamSize(Number(e.target.value) || 0)}
              />
            </Field>

            <div className="rounded-lg border-l-4 border-brand-600 bg-brand-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-600">
                Auto-priced
              </div>
              <div className="mt-1 text-3xl font-bold text-brand-700">
                {tier ? `RM ${tier.price.toLocaleString()}` : 'Out of range'}
              </div>
              <div className="mt-1 text-xs text-ink-600">
                {tier ? `Tier: ${tier.min}–${tier.max} pax` : 'Supported: 1–50 pax'}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={() => navigate('/hm/org-chart')} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy || !tier || !company.trim() || !session?.user.id}>
                {busy ? 'Creating…' : 'Create Consultation'}
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-600">
              Pricing Ladder
            </div>
            <table className="mt-2 w-full text-xs">
              <tbody>
                {ORG_TIERS.map(t => (
                  <tr
                    key={t.code}
                    className={
                      tier?.code === t.code
                        ? 'border-t border-ink-100 bg-brand-50 font-medium first:border-0'
                        : 'border-t border-ink-100 first:border-0'
                    }
                  >
                    <td className="px-2 py-1.5">{t.min}–{t.max} pax</td>
                    <td className="px-2 py-1.5 text-right">RM {t.price.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
