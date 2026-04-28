import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../state/useSession'
import { supabase } from '../lib/supabase'
import { Alert, Badge, Button, Card, CardBody, EmptyState, PageHeader, Spinner, Stat } from '../components/ui'

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

const REASON_LABEL: Record<string, string> = {
  reject_with_reason:    'Rejected match + gave reason',
  accept_interview:      'Accepted match — interview confirmed',
  interviewer_rejects:   'Interviewer rejected (consolation)',
  end_review:            'Submitted end-to-end review',
  referral_onboarded:    'Friend joined via your referral',
  referee_welcome:       'Welcome bonus (joined via referral)',
  redeem_extra_match:    'Redeemed for extra match',
  extra_match_purchased: 'Purchased points package',
}

export default function PointsWallet() {
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

      // For now: packages award points directly via Billplz. We re-use
      // unlock-extra-match infrastructure — in future a dedicated
      // buy-points endpoint will handle this. For MVP, redirect to Billplz
      // bill URL returned by the Edge Function.
      // TODO: wire up dedicated buy-points Edge Function for package purchases.
      alert(`Billplz payment for ${pkg.name} (RM ${pkg.price_rm} → ${pkg.points} pts) will be wired when Billplz credentials are configured.`)
    } catch (e) {
      setBuyErr((e as Error).message)
    } finally {
      setBuyingId(null)
    }
  }

  if (!session) return null
  if (loading) return <div className="py-12 text-center"><Spinner /></div>

  const pts = profile?.points ?? 0

  return (
    <div>
      <PageHeader
        eyebrow="Diamond Points"
        title="Your points wallet"
        description="Earn points by engaging with the platform. Redeem them for extra matches."
      />

      {/* Balance + how-to-earn */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Stat label="Current balance" value={pts} tone="brand" hint={`${profile?.points_earned_total ?? 0} earned all time`} />
        <Stat label="Cost to unlock match" value="21 pts" hint="or RM 9.90 via Billplz FPX" />
        <Stat label="Referral reward" value="19 pts" hint="5 pts for new friend too" />
      </div>

      {/* How to earn */}
      <Card className="mb-8">
        <CardBody>
          <h2 className="font-display text-base font-semibold mb-3">How to earn Diamond Points</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-ink-700">
            {[
              ['+5 pts', 'Reject a proposed match and explain why (each)'],
              ['+5 pts', 'Accept a match and attend the interview'],
              ['+5 pts', 'Interviewer rejects you — consolation award'],
              ['+5 pts', 'Submit an end-to-end review after your journey'],
              ['+19 pts', 'A friend joins using your referral link'],
              ['+5 pts', 'You joined via a friend\'s referral link'],
            ].map(([pts, desc]) => (
              <div key={desc} className="flex items-start gap-2">
                <span className="font-semibold text-brand-700 shrink-0 w-14">{pts}</span>
                <span>{desc}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-ink-100">
            <Link to="/referrals" className="text-sm text-brand-600 font-medium hover:underline">
              View your referral link →
            </Link>
          </div>
        </CardBody>
      </Card>

      {/* Buy points */}
      <h2 className="font-display text-base font-semibold mb-3">Buy Diamond Points</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {packages.map((pkg) => (
          <Card key={pkg.id} className="relative overflow-hidden">
            <CardBody>
              <div className="text-lg font-bold text-ink-900 mb-0.5">{pkg.name}</div>
              <div className="text-3xl font-display font-bold text-brand-700 mb-1">
                {pkg.points} <span className="text-base font-normal text-ink-500">pts</span>
              </div>
              <div className="text-sm text-ink-500 mb-4">RM {pkg.price_rm.toFixed(2)} via Billplz FPX</div>
              <Button
                onClick={() => void buyPackage(pkg)}
                loading={buyingId === pkg.id}
                className="w-full"
                variant="brand"
              >
                Buy — RM {pkg.price_rm.toFixed(2)}
              </Button>
            </CardBody>
          </Card>
        ))}
        {packages.length === 0 && (
          <div className="col-span-2 text-sm text-ink-500">No packages configured yet.</div>
        )}
      </div>
      {buyErr && <div className="mb-4"><Alert tone="red">{buyErr}</Alert></div>}

      {/* Ledger */}
      <h2 className="font-display text-base font-semibold mb-3">Points history</h2>
      <Card>
        <CardBody className="p-0">
          {ledger.length === 0 ? (
            <EmptyState title="No transactions yet" description="Start earning by engaging with your matches." />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-500 bg-ink-50">
                <tr>
                  <th className="p-3">Action</th>
                  <th className="p-3 text-right">Points</th>
                  <th className="p-3 text-right hidden sm:table-cell">Date</th>
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
          Refresh balance
        </button>
      </div>
    </div>
  )
}
