import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '../state/useSession'
import { supabase } from '../lib/supabase'
import { Alert, Badge, Button, Card, CardBody, EmptyState, PageHeader, Spinner, Stat } from '../components/ui'
import { useSeo } from '../lib/useSeo'

interface LedgerRow {
  id: string
  delta: number
  reason: string
  created_at: string
}

interface Package {
  id: string
  name: string
  price_rm: number
  points: number
}

export default function PointsWallet() {
  useSeo({ title: 'Diamond Points', noindex: true })
  const { t } = useTranslation()
  const REASON_LABEL: Record<string, string> = {
    reject_with_reason:    t('points.ruleRejectMatch'),
    accept_interview:      t('points.ruleAcceptMatch'),
    interviewer_rejects:   t('points.ruleConsolation'),
    end_review:            t('points.ruleEndReview'),
    referral_onboarded:    t('points.ruleReferral'),
    referee_welcome:       t('points.ruleReferred'),
    redeem_extra_match:    t('points.redeem', { cost: 21 }),
    extra_match_purchased: t('points.buyTitle'),
  }
  const { session, profile, refresh } = useSession()
  const [ledger, setLedger]     = useState<LedgerRow[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading]   = useState(true)
  const [buyErr, setBuyErr]     = useState<string | null>(null)
  const [buyingId, setBuyingId] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    let cancelled = false
    void (async () => {
      const [ledgerR, pkgR] = await Promise.all([
        supabase.from('point_transactions')
          .select('id, delta, reason, created_at')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('system_config').select('value').eq('key', 'points_packages').maybeSingle(),
      ])
      if (cancelled) return
      setLedger((ledgerR.data as LedgerRow[] | null) ?? [])
      if (Array.isArray(pkgR.data?.value)) setPackages(pkgR.data!.value as Package[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [session])

  async function buyPackage(pkg: Package) {
    if (!session) return
    setBuyErr(null)
    setBuyingId(pkg.id)
    try {
      const { data: authData } = await supabase.auth.getSession()
      const token = authData.session?.access_token
      if (!token) throw new Error('Not authenticated')

      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/buy-points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ package_id: pkg.id }),
      })
      const j = await r.json() as { paymentUrl?: string; error?: string }
      if (!r.ok || !j.paymentUrl) throw new Error(j.error || 'Failed to start payment')
      // Hand off to Billplz hosted checkout. Webhook credits the points
      // once the bill is paid; redirect URL brings the user back to /payment/return.
      window.location.assign(j.paymentUrl)
    } catch (e) {
      setBuyErr((e as Error).message)
      setBuyingId(null)
    }
  }

  if (!session) return null
  if (loading) return <div className="py-12 text-center"><Spinner /></div>

  const pts = profile?.points ?? 0

  return (
    <div>
      <PageHeader
        eyebrow={t('points.eyebrow')}
        title={t('points.title')}
        description={t('points.subtitle')}
      />

      {/* Balance + how-to-earn */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Stat label={t('points.currentBalance')} value={pts} tone="brand" hint={t('points.earnedAllTime', { n: profile?.points_earned_total ?? 0 })} />
        <Stat label={t('points.costToUnlock')} value={`21 ${t('points.balance').toLowerCase()}`} hint={t('points.costSuffix', { rm: '9.90' })} />
        <Stat label={t('points.referralReward')} value={`19 ${t('points.balance').toLowerCase()}`} hint={t('points.referralFriendBonus', { n: 5 })} />
      </div>

      {/* How to earn */}
      <Card className="mb-8">
        <CardBody>
          <h2 className="font-display text-base font-semibold mb-3">{t('points.howToEarnTitle')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-ink-700">
            {[
              ['+5', t('points.ruleRejectMatch')],
              ['+5', t('points.ruleAcceptMatch')],
              ['+5', t('points.ruleConsolation')],
              ['+5', t('points.ruleEndReview')],
              ['+19', t('points.ruleReferral')],
              ['+5', t('points.ruleReferred')],
            ].map(([n, desc]) => (
              <div key={desc} className="flex items-start gap-2">
                <span className="font-semibold text-brand-700 shrink-0 w-14">{n} {t('points.balance').toLowerCase()}</span>
                <span>{desc}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-ink-100">
            <Link to="/referrals" className="text-sm text-brand-600 font-medium hover:underline">
              {t('points.viewReferralLink')}
            </Link>
          </div>
        </CardBody>
      </Card>

      {/* Buy points */}
      <h2 className="font-display text-base font-semibold mb-3">{t('points.buyTitle')}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {packages.map((pkg) => (
          <Card key={pkg.id} className="relative overflow-hidden">
            <CardBody>
              <div className="text-lg font-bold text-ink-900 mb-0.5">{pkg.name}</div>
              <div className="text-3xl font-display font-bold text-brand-700 mb-1">
                {pkg.points} <span className="text-base font-normal text-ink-500">{t('points.balance').toLowerCase()}</span>
              </div>
              <div className="text-sm text-ink-500 mb-4">{t('points.costSuffix', { rm: pkg.price_rm.toFixed(2) })}</div>
              <Button
                onClick={() => void buyPackage(pkg)}
                loading={buyingId === pkg.id}
                className="w-full"
                variant="brand"
              >
                {buyingId === pkg.id ? t('points.buying') : t('points.buyButton', { rm: pkg.price_rm.toFixed(2) })}
              </Button>
            </CardBody>
          </Card>
        ))}
        {packages.length === 0 && (
          <div className="col-span-2 text-sm text-ink-500">{t('common.comingSoon')}</div>
        )}
      </div>
      {buyErr && <div className="mb-4"><Alert tone="red">{buyErr}</Alert></div>}

      {/* Ledger */}
      <h2 className="font-display text-base font-semibold mb-3">{t('points.history')}</h2>
      <Card>
        <CardBody className="p-0">
          {ledger.length === 0 ? (
            <EmptyState title={t('points.noTransactions')} description={t('points.noTransactionsHint')} />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-500 bg-ink-50">
                <tr>
                  <th className="p-3">{t('common.submit')}</th>
                  <th className="p-3 text-right">{t('points.balance')}</th>
                  <th className="p-3 text-right hidden sm:table-cell">{t('common.loading').replace(/…$/, '')}</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr key={row.id} className="border-t border-ink-100">
                    <td className="p-3 text-ink-800">
                      {REASON_LABEL[row.reason] ?? row.reason}
                    </td>
                    <td className="p-3 text-right font-semibold">
                      <Badge tone={row.delta >= 0 ? 'green' : 'red'}>
                        {row.delta >= 0 ? '+' : ''}{row.delta}
                      </Badge>
                    </td>
                    <td className="p-3 text-right text-ink-500 hidden sm:table-cell">
                      {new Date(row.created_at).toLocaleDateString('en-MY')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-xs text-ink-400 hover:text-ink-600"
        >
          {t('points.refresh')}
        </button>
      </div>
    </div>
  )
}
