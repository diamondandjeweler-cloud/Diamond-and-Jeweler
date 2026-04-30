import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../state/useSession'
import { Alert, Button, Card, CardBody, PageHeader, Spinner } from '../components/ui'

/**
 * Landing page after Billplz redirects the buyer back. Polls the relevant
 * purchase row for `payment_status` until it flips to 'paid' (or 'failed'),
 * then refreshes the session profile so the new balance / quota appears.
 *
 * Routes:
 *   /payment/return?purchase=<id>&kind=points|extra_match
 *   /payment/mock?purchase=<id>&kind=points|extra_match  (dev only — no real charge)
 */
export default function PaymentReturn() {
  const [params] = useSearchParams()
  const purchaseId = params.get('purchase') ?? ''
  const kind = (params.get('kind') ?? 'extra_match') as 'points' | 'extra_match'
  const isMock = window.location.pathname.startsWith('/payment/mock')
  const { refresh } = useSession()
  const [status, setStatus] = useState<'pending' | 'paid' | 'failed' | 'unknown'>('pending')
  const [tries, setTries] = useState(0)
  const [confirming, setConfirming] = useState(false)

  const table = kind === 'points' ? 'point_purchases' : 'extra_match_purchases'

  useEffect(() => {
    if (!purchaseId) { setStatus('unknown'); return }
    let alive = true
    void (async () => {
      // Poll up to 10 times at 1.5s intervals — webhook usually fires within 2s.
      for (let i = 0; i < 10; i++) {
        if (!alive) return
        const { data } = await supabase.from(table)
          .select('payment_status').eq('id', purchaseId).maybeSingle()
        const s = (data?.payment_status as string | undefined) ?? 'pending'
        if (s === 'paid' || s === 'failed') {
          setStatus(s as 'paid' | 'failed')
          if (s === 'paid') await refresh()
          return
        }
        setTries(i + 1)
        await new Promise((r) => setTimeout(r, 1500))
      }
      if (alive) setStatus('pending') // still pending — show "we'll email you" UX
    })()
    return () => { alive = false }
  }, [purchaseId, table, refresh])

  /** Mock-only: lets you simulate webhook success in dev/preview when Billplz keys aren't set. */
  async function confirmMock() {
    if (!purchaseId) return
    setConfirming(true)
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payment-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `MOCK-${kind === 'points' ? 'PTS-' : ''}${purchaseId}`,
          paid: 'true',
          paid_at: new Date().toISOString(),
          reference_1: purchaseId,
        }),
      })
      // Re-poll once.
      const { data } = await supabase.from(table)
        .select('payment_status').eq('id', purchaseId).maybeSingle()
      if ((data?.payment_status as string | undefined) === 'paid') {
        setStatus('paid')
        await refresh()
      }
    } finally {
      setConfirming(false)
    }
  }

  const homeHref = useMemo(() => kind === 'points' ? '/points' : '/home', [kind])

  return (
    <div className="max-w-xl mx-auto py-12 px-4">
      <PageHeader
        eyebrow="Payment"
        title={status === 'paid' ? 'Payment confirmed' : status === 'failed' ? 'Payment failed' : 'Confirming payment…'}
        description={kind === 'points' ? 'Diamond Points are credited as soon as Billplz confirms the bill.' : 'Your extra match is generated as soon as Billplz confirms the bill.'}
      />

      <Card>
        <CardBody>
          {!purchaseId && (
            <Alert tone="red">No purchase reference in URL.</Alert>
          )}

          {purchaseId && status === 'pending' && (
            <div className="text-center py-6">
              <Spinner />
              <p className="mt-3 text-sm text-ink-600">
                Waiting for Billplz to confirm your payment… (attempt {tries}/10)
              </p>
              <p className="mt-1 text-xs text-ink-400">
                You can safely leave — we'll email you the moment it's confirmed.
              </p>
            </div>
          )}

          {purchaseId && status === 'paid' && (
            <Alert tone="green" title="Confirmed">
              Thanks! {kind === 'points' ? 'Your Diamond Points have been credited to your wallet.' : 'Your extra match is being generated now and will appear on your dashboard shortly.'}
            </Alert>
          )}

          {purchaseId && status === 'failed' && (
            <Alert tone="red" title="Payment did not complete">
              The bill was cancelled or rejected. You haven't been charged. Try again from the {kind === 'points' ? 'Points wallet' : 'dashboard'}.
            </Alert>
          )}

          {isMock && status === 'pending' && purchaseId && (
            <div className="mt-4 pt-4 border-t border-ink-100">
              <p className="text-xs text-amber-700 mb-2">
                <strong>Dev mode:</strong> Billplz credentials aren't configured. Click below to simulate a paid webhook.
              </p>
              <Button onClick={() => void confirmMock()} loading={confirming} variant="brand" size="sm">
                Simulate payment success
              </Button>
            </div>
          )}

          <div className="mt-6 flex justify-center">
            <Link to={homeHref} className="text-sm text-brand-600 hover:underline">
              ← Back to {kind === 'points' ? 'Points wallet' : 'home'}
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
