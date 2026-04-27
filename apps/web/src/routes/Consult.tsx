import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { callFunction } from '../lib/functions'
import { Button, Card, Alert, PageHeader } from '../components/ui'
import LoadingSpinner from '../components/LoadingSpinner'

type Tier = 'quick' | 'standard' | 'deep'

interface TierConfig {
  key: Tier
  label: string
  price: number | null
  minutes: number | null
}

interface InitResp {
  booking_id: string
  tier: Tier
  price_rm: number
  duration_minutes: number
  redirect_url?: string
  manual?: boolean
  message?: string
}

const TIER_DESCRIPTIONS: Record<Tier, string> = {
  quick:    'A short read on your current direction — best for a single, focused question.',
  standard: 'Enough time to walk through your situation and get tailored, actionable next steps.',
  deep:     'Full session — covers career direction, timing windows, and a 6–12 month plan.',
}

export default function Consult() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const onReturn = params.get('booking_id')

  const [tiers, setTiers] = useState<TierConfig[]>([])
  const [currency, setCurrency] = useState('RM')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Tier | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [manualMsg, setManualMsg] = useState<string | null>(null)
  const [returnInfo, setReturnInfo] = useState<{ status: string; videoUrl: string | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadConfig() {
      const keys = [
        'consult_price_quick', 'consult_price_standard', 'consult_price_deep',
        'consult_minutes_quick', 'consult_minutes_standard', 'consult_minutes_deep',
        'consult_label_quick', 'consult_label_standard', 'consult_label_deep',
        'consult_currency',
      ]
      const { data } = await supabase.from('system_config').select('key, value').in('key', keys)
      if (cancelled) return
      const map = new Map<string, unknown>()
      for (const row of (data ?? []) as Array<{ key: string; value: unknown }>) {
        map.set(row.key, row.value)
      }
      const cur = typeof map.get('consult_currency') === 'string' ? map.get('consult_currency') as string : 'RM'
      setCurrency(cur)
      setTiers([
        { key: 'quick',    label: stringValue(map.get('consult_label_quick'),    'Quick read'),
          price: numberValue(map.get('consult_price_quick')), minutes: numberValue(map.get('consult_minutes_quick')) },
        { key: 'standard', label: stringValue(map.get('consult_label_standard'), 'Standard'),
          price: numberValue(map.get('consult_price_standard')), minutes: numberValue(map.get('consult_minutes_standard')) },
        { key: 'deep',     label: stringValue(map.get('consult_label_deep'),     'Deep dive'),
          price: numberValue(map.get('consult_price_deep')), minutes: numberValue(map.get('consult_minutes_deep')) },
      ])
      setLoading(false)
    }
    void loadConfig()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!onReturn) return
    let cancelled = false
    void supabase.from('consult_bookings')
      .select('status, video_url')
      .eq('id', onReturn)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setReturnInfo({ status: (data as { status: string }).status, videoUrl: (data as { video_url: string | null }).video_url })
      })
    return () => { cancelled = true }
  }, [onReturn])

  async function pickTier(tier: Tier) {
    setBusy(tier); setErr(null); setManualMsg(null)
    try {
      const r = await callFunction<InitResp>('init-consult-booking', { tier })
      if (r.manual) {
        setManualMsg(r.message ?? 'The admin will be in touch by email to confirm your session.')
      } else if (r.redirect_url) {
        window.location.href = r.redirect_url
      } else {
        setErr('Could not start payment. Please try again.')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <LoadingSpinner full />

  if (onReturn) {
    return (
      <div className="max-w-xl mx-auto">
        <PageHeader eyebrow="Consult" title="Thanks for booking" />
        <Card>
          <div className="p-6 space-y-3">
            {returnInfo?.status === 'scheduled' || returnInfo?.status === 'paid' ? (
              <>
                <Alert tone="green">Payment received — your session is confirmed.</Alert>
                {returnInfo.videoUrl ? (
                  <p className="text-sm text-ink-700">
                    Your 1-on-1 video link:{' '}
                    <a href={returnInfo.videoUrl} target="_blank" rel="noreferrer" className="text-brand-600 underline break-all">
                      {returnInfo.videoUrl}
                    </a>
                  </p>
                ) : (
                  <p className="text-sm text-ink-700">
                    We&apos;ll email you the video link shortly. If you don&apos;t see it within a few minutes, check spam.
                  </p>
                )}
              </>
            ) : returnInfo?.status === 'pending' ? (
              <Alert tone="amber">We haven&apos;t received the payment confirmation yet. This page will update once it arrives — usually within a minute.</Alert>
            ) : (
              <Alert tone="red">We couldn&apos;t confirm your booking. Please contact support if payment was deducted.</Alert>
            )}
            <Button onClick={() => navigate('/home')} variant="secondary">Back to home</Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        eyebrow="1-on-1 advisory"
        title="Book a private career consult"
        description="Talk through your direction with a senior advisor. Pick the depth that fits your moment."
      />

      {err && <div className="mb-6"><Alert tone="red">{err}</Alert></div>}
      {manualMsg && <div className="mb-6"><Alert tone="amber">{manualMsg}</Alert></div>}

      <div className="grid md:grid-cols-3 gap-4">
        {tiers.map((t) => {
          const available = t.price != null && t.price > 0 && t.minutes != null && t.minutes > 0
          return (
            <Card key={t.key} className="flex flex-col">
              <div className="p-5 md:p-6 flex-1 space-y-3">
                <h3 className="text-base font-semibold text-ink-900">{t.label}</h3>
                <div className="text-2xl font-bold text-ink-900">
                  {currency} {t.price ?? '—'}
                  <span className="ml-2 text-sm font-normal text-ink-500">/ {t.minutes ?? '—'} min</span>
                </div>
                <p className="text-sm text-ink-600">{TIER_DESCRIPTIONS[t.key]}</p>
              </div>
              <div className="p-5 md:p-6 pt-0">
                <Button
                  onClick={() => pickTier(t.key)}
                  disabled={!available || busy != null}
                  loading={busy === t.key}
                  className="w-full"
                >
                  {available ? `Book ${t.label.toLowerCase()}` : 'Coming soon'}
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      <p className="mt-6 text-xs text-ink-500">
        Sessions run on a private 1-on-1 video call. After payment you&apos;ll receive your unique link by email.
      </p>
    </div>
  )
}

function numberValue(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v); return Number.isFinite(n) ? n : null
  }
  return null
}
function stringValue(v: unknown, fallback: string): string {
  if (typeof v === 'string') return v
  return fallback
}
