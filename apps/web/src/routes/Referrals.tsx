import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../state/useSession'
import { supabase } from '../lib/supabase'
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, PageHeader, Spinner, Stat } from '../components/ui'

interface Referral {
  id: string
  referred_email: string
  code: string
  status: string
  created_at: string
  reward_claimed_at: string | null
}

export default function Referrals() {
  const { t } = useTranslation()
  const { session, profile, refresh } = useSession()
  const [list, setList] = useState<Referral[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pointsCfg, setPointsCfg] = useState({ perReferral: 19, perExtra: 21 })
  const [copyMsg, setCopyMsg] = useState<string | null>(null)
  const [redeeming, setRedeeming] = useState(false)

  useEffect(() => {
    if (!session) return
    let cancelled = false
    void (async () => {
      const [refsR, cfgPerRef, cfgPerExtra] = await Promise.all([
        supabase.from('referrals').select('*').eq('referrer_id', session.user.id).order('created_at', { ascending: false }),
        supabase.from('system_config').select('value').eq('key', 'points_per_referral').maybeSingle(),
        supabase.from('system_config').select('value').eq('key', 'points_per_extra_match').maybeSingle(),
      ])
      if (cancelled) return
      setList((refsR.data as Referral[] | null) ?? [])
      setPointsCfg({
        perReferral: typeof cfgPerRef.data?.value === 'number' ? cfgPerRef.data.value : 19,
        perExtra:    typeof cfgPerExtra.data?.value === 'number' ? cfgPerExtra.data.value : 21,
      })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [session])

  const create = async () => {
    if (!email.trim() || !email.includes('@')) { setErr('Enter a valid email'); return }
    if (!session) return
    setBusy(true); setErr(null)
    try {
      const { data: code } = await supabase.rpc('generate_referral_code')
      const { data, error } = await supabase.from('referrals').insert({
        referrer_id: session.user.id,
        referred_email: email.trim().toLowerCase(),
        code: (code as string) ?? Math.random().toString(36).slice(2, 10).toUpperCase(),
      }).select().single()
      if (error) throw error
      setList((p) => [data as Referral, ...p])
      setEmail('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const copyLink = async (code: string) => {
    const url = `${window.location.origin}/signup?ref=${code}`
    try {
      await navigator.clipboard.writeText(url)
      setCopyMsg(t('referral.copied'))
      setTimeout(() => setCopyMsg(null), 1800)
    } catch { /* ignore */ }
  }

  if (!session) return null
  if (loading) return <div className="py-12 text-center text-ink-500"><Spinner /> {t('common.loading')}</div>

  const rewarded = list.filter((r) => r.status === 'rewarded')
  const points = profile?.points ?? 0
  const canRedeem = points >= pointsCfg.perExtra

  return (
    <div>
      <PageHeader
        eyebrow={t('referral.title')}
        title={t('referral.title')}
        description={t('referral.subtitle', { points: pointsCfg.perReferral })}
      />

      {profile?.referral_code && (
        <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-brand-700 font-medium mb-0.5">Your referral link</div>
            <div className="font-mono text-sm text-ink-900">
              {window.location.origin}/signup?ref={profile.referral_code}
            </div>
            <div className="text-xs text-ink-500 mt-0.5">Friend earns +5 pts · You earn +{pointsCfg.perReferral} pts when they finish onboarding</div>
          </div>
          <button
            type="button"
            onClick={() => copyLink(profile.referral_code!)}
            className="shrink-0 btn-ghost btn-sm"
          >
            Copy
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Stat label={t('points.balance')} value={points} tone="brand" hint={`${profile?.points_earned_total ?? 0} earned all time`} />
        <Stat label="Successful referrals" value={rewarded.length} hint={`${rewarded.length * pointsCfg.perReferral} pts earned`} />
        <Stat label="Pending referrals" value={list.length - rewarded.length} />
      </div>

      <Card className="mb-6">
        <CardBody>
          <h2 className="font-display text-lg mb-3">Send an invite</h2>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input label="Friend's email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" />
            </div>
            <Button onClick={create} loading={busy}>Generate code</Button>
          </div>
          {err && <Alert tone="red">{err}</Alert>}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          {list.length === 0 ? (
            <EmptyState title="No referrals yet" description="Generate your first invite above." />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-500 bg-ink-50">
                <tr><th className="p-3">Email</th><th className="p-3">{t('referral.yourCode')}</th><th className="p-3">Status</th><th className="p-3">Created</th><th className="p-3"></th></tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-t border-ink-100">
                    <td className="p-3">{r.referred_email}</td>
                    <td className="p-3 font-mono text-xs">{r.code}</td>
                    <td className="p-3">
                      <Badge tone={r.status === 'rewarded' ? 'green' : r.status === 'cancelled' || r.status === 'expired' ? 'red' : 'amber'}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-ink-500">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => copyLink(r.code)} className="btn-ghost btn-sm">Copy link</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {copyMsg && <div className="px-4 py-2 text-xs text-emerald-700 bg-emerald-50 border-t border-emerald-200">{copyMsg}</div>}
        </CardBody>
      </Card>

      {profile?.role === 'hiring_manager' && (
        <Card className="mt-6">
          <CardBody>
            <h2 className="font-display text-lg mb-2">Redeem points</h2>
            <p className="text-sm text-ink-600 mb-3">{t('points.redeem', { cost: pointsCfg.perExtra })}</p>
            <Button
              variant="brand"
              disabled={!canRedeem || redeeming}
              loading={redeeming}
              onClick={async () => {
                const roleId = window.prompt('Enter the role ID to grant 1 free extra match to:')
                if (!roleId) return
                setRedeeming(true)
                try {
                  const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/redeem-points`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}`,
                    },
                    body: JSON.stringify({ role_id: roleId.trim() }),
                  })
                  const j = await r.json() as { error?: string }
                  if (!r.ok) throw new Error(j.error || 'Failed')
                  await refresh()
                  alert('Redeemed!')
                } catch (e) {
                  alert((e as Error).message)
                } finally {
                  setRedeeming(false)
                }
              }}
            >
              Redeem {pointsCfg.perExtra} pts
            </Button>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
