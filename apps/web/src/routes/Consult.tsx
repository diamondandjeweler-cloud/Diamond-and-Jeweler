import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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

export default function Consult() {
  const { t } = useTranslation()
  const TIER_DESCRIPTIONS: Record<Tier, string> = {
    quick:    t('consult.tierDesc.quick'),
    standard: t('consult.tierDesc.standard'),
    deep:     t('consult.tierDesc.deep'),
  }
  const TIER_LABELS: Record<Tier, string> = {
    quick:    t('consult.tier.quick'),
    standard: t('consult.tier.standard'),
    deep:     t('consult.tier.deep'),
  }
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
        { key: 'quick',    label: stringValue(map.get('consult_label_quick'),    TIER_LABELS.quick),
          price: numberValue(map.get('consult_price_quick')), minutes: numberValue(map.get('consult_minutes_quick')) },
        { key: 'standard', label: stringValue(map.get('consult_label_standard'), TIER_LABELS.standard),
          price: numberValue(map.get('consult_price_standard')), minutes: numberValue(map.get('consult_minutes_standard')) },
        { key: 'deep',     label: stringValue(map.get('consult_label_deep'),     TIER_LABELS.deep),
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
        setErr(t('consult.couldNotStart'))
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
        <PageHeader eyebrow={t('consult.eyebrow')} title={t('consult.thanksTitle')} />
        <Card>
          <div className="p-6 space-y-3">
            {returnInfo?.status === 'scheduled' || returnInfo?.status === 'paid' ? (
              <>
                <Alert tone="green">{t('consult.paid')}</Alert>
                {returnInfo.videoUrl ? (
                  <p className="text-sm text-ink-700">
                    {t('consult.videoLink')}{' '}
                    <a href={returnInfo.videoUrl} target="_blank" rel="noreferrer" className="text-brand-600 underline break-all">
                      {returnInfo.videoUrl}
                    </a>
                  </p>
                ) : (
                  <p className="text-sm text-ink-700">{t('consult.willEmail')}</p>
                )}
              </>
            ) : returnInfo?.status === 'pending' ? (
              <Alert tone="amber">{t('consult.pendingConfirm')}</Alert>
            ) : (
              <Alert tone="red">{t('consult.couldNotConfirm')}</Alert>
            )}
            <Button onClick={() => navigate('/home')} variant="secondary">{t('consult.backHome')}</Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        eyebrow={t('consult.eyebrow')}
        title={t('consult.title')}
        description={t('consult.subtitle')}
      />

      {err && <div className="mb-6"><Alert tone="red">{err}</Alert></div>}
      {manualMsg && <div className="mb-6"><Alert tone="amber">{manualMsg}</Alert></div>}

      <div className="grid md:grid-cols-3 gap-4">
        {tiers.map((tier) => {
          const available = tier.price != null && tier.price > 0 && tier.minutes != null && tier.minutes > 0
          return (
            <Card key={tier.key} className="flex flex-col">
              <div className="p-5 md:p-6 flex-1 space-y-3">
                <h3 className="text-base font-semibold text-ink-900">{tier.label}</h3>
                <div className="text-2xl font-bold text-ink-900">
                  {currency} {tier.price ?? '—'}
                  <span className="ml-2 text-sm font-normal text-ink-500">/ {tier.minutes != null ? t('consult.minutes', { n: tier.minutes }) : '—'}</span>
                </div>
                <p className="text-sm text-ink-600">{TIER_DESCRIPTIONS[tier.key]}</p>
              </div>
              <div className="p-5 md:p-6 pt-0">
                <Button
                  onClick={() => pickTier(tier.key)}
                  disabled={!available || busy != null}
                  loading={busy === tier.key}
                  className="w-full"
                >
                  {available ? t('consult.book', { tier: tier.label }) : t('common.comingSoon')}
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      <p className="mt-6 text-xs text-ink-500">
        {t('consult.footnote')}
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
