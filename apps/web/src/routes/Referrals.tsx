import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '../state/useSession'
import { supabase } from '../lib/supabase'
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, PageHeader, Select, Spinner, Stat } from '../components/ui'

interface Referral {
  id: string
  referred_email: string
  code: string
  status: string
  created_at: string
  reward_claimed_at: string | null
}

interface RoleOption {
  id: string
  title: string
  status: string
  extra_matches_used: number
}

export default function Referrals() {
  const { t } = useTranslation()
  const { session, profile, refresh } = useSession()
  const [searchParams] = useSearchParams()
  const alreadySignedInNotice = searchParams.get('notice') === 'already_signed_in'
  const [list, setList] = useState<Referral[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pointsCfg, setPointsCfg] = useState({ perReferral: 19, perWelcome: 5, perExtra: 21 })
  const [copyMsg, setCopyMsg] = useState<string | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [pickedRoleId, setPickedRoleId] = useState<string>('')
  const [showQr, setShowQr] = useState(false)

  const isTalent = profile?.role === 'talent'
  const isHM = profile?.role === 'hiring_manager'

  // Key on user.id (not the session object) so hourly TOKEN_REFRESHED events
  // don't cancel the load and trap the page on the loading spinner.
  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void (async () => {
      try {
        const [refsR, cfgPerRef, cfgPerWelcome, cfgPerExtra] = await Promise.all([
          supabase.from('referrals').select('*').eq('referrer_id', userId).order('created_at', { ascending: false }),
          supabase.from('system_config').select('value').eq('key', 'points_per_referral').maybeSingle(),
          supabase.from('system_config').select('value').eq('key', 'points_referee_welcome').maybeSingle(),
          supabase.from('system_config').select('value').eq('key', 'points_per_extra_match').maybeSingle(),
        ])
        if (cancelled) return
        setList((refsR.data as Referral[] | null) ?? [])
        setPointsCfg({
          perReferral: typeof cfgPerRef.data?.value === 'number' ? cfgPerRef.data.value : 19,
          perWelcome:  typeof cfgPerWelcome.data?.value === 'number' ? cfgPerWelcome.data.value : 5,
          perExtra:    typeof cfgPerExtra.data?.value === 'number' ? cfgPerExtra.data.value : 21,
        })

        // For HMs, fetch their active roles so the redeem picker can be a dropdown.
        if (profile?.role === 'hiring_manager') {
          const { data: hm } = await supabase.from('hiring_managers')
            .select('id').eq('profile_id', userId).maybeSingle()
          if (hm?.id) {
            const { data: roleRows } = await supabase.from('roles')
              .select('id, title, status, extra_matches_used')
              .eq('hiring_manager_id', hm.id)
              .order('created_at', { ascending: false })
            if (!cancelled && roleRows) {
              setRoles(roleRows as RoleOption[])
              const firstActive = (roleRows as RoleOption[]).find((r) => r.status === 'active' && (r.extra_matches_used ?? 0) < 3)
              if (firstActive) setPickedRoleId(firstActive.id)
            }
          }
        }
      } catch (e) {
        if (!cancelled) setErr((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [userId, profile?.role])

  const shareUrl = useMemo(() => {
    if (!profile?.referral_code) return ''
    return `${window.location.origin}/signup?ref=${profile.referral_code}`
  }, [profile?.referral_code])

  const shareMessage = useMemo(() => {
    return `Join me on DNJ — Malaysia's AI-powered career matching platform. We both earn Diamond Points when you sign up. ${shareUrl}`
  }, [shareUrl])

  const create = async () => {
    if (!email.trim() || !email.includes('@')) { setErr('Enter a valid email'); return }
    if (!session) return
    setBusy(true); setErr(null)
    try {
      // Supabase builders are PromiseLike (not full Promise), so use Promise.race directly.
      const timedOut = () => new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Please try again.')), 10000)
      )
      const { data: code } = await Promise.race([supabase.rpc('generate_referral_code'), timedOut()])
      const { data, error } = await Promise.race([
        supabase.from('referrals').insert({
          referrer_id: session.user.id,
          referred_email: email.trim().toLowerCase(),
          code: (code as string) ?? Math.random().toString(36).slice(2, 10).toUpperCase(),
        }).select().single(),
        timedOut(),
      ])
      if (error) throw error
      setList((p) => [data as Referral, ...p])
      setEmail('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const flashCopy = (msg: string) => {
    setCopyMsg(msg)
    setTimeout(() => setCopyMsg(null), 1800)
  }

  const copyLink = async (code: string) => {
    const url = `${window.location.origin}/signup?ref=${code}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Clipboard API unavailable — fall back to execCommand
      try {
        const ta = document.createElement('textarea')
        ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0'
        document.body.appendChild(ta); ta.focus(); ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      } catch { /* ignore */ }
    }
    flashCopy(t('referral.copied') ?? 'Link copied!')
  }

  const handleNativeShare = async () => {
    if (!shareUrl) return
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join me on DNJ',
          text: shareMessage,
          url: shareUrl,
        })
        return
      } catch { /* user cancelled */ }
    }
    await navigator.clipboard.writeText(shareUrl)
    flashCopy('Native share unavailable — link copied instead')
  }

  const shareViaWhatsApp = () => {
    if (!shareUrl) return
    const url = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const shareViaTelegram = () => {
    if (!shareUrl) return
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareMessage)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const shareViaEmail = () => {
    if (!shareUrl) return
    const subject = encodeURIComponent('Join me on DNJ')
    const body = encodeURIComponent(shareMessage)
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }

  const redeemForRole = async () => {
    if (!pickedRoleId) { alert('Pick a role first'); return }
    setRedeeming(true)
    try {
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/redeem-points`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ target_type: 'role', role_id: pickedRoleId }),
      })
      const j = await r.json() as { error?: string; cost?: number }
      if (!r.ok) throw new Error(j.error || 'Failed')
      await refresh()
      // Refresh role quotas locally.
      setRoles((prev) => prev.map((row) => row.id === pickedRoleId
        ? { ...row, extra_matches_used: row.extra_matches_used + 1 }
        : row))
      flashCopy(`Redeemed ${j.cost ?? pointsCfg.perExtra} Diamond Points — extra match generating shortly.`)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setRedeeming(false)
    }
  }

  const redeemForTalent = async () => {
    setRedeeming(true)
    try {
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/redeem-points`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ target_type: 'talent' }),
      })
      const j = await r.json() as { error?: string; cost?: number }
      if (!r.ok) throw new Error(j.error || 'Failed')
      await refresh()
      flashCopy(`Redeemed ${j.cost ?? pointsCfg.perExtra} Diamond Points — your next match is being generated.`)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setRedeeming(false)
    }
  }

  if (!session) return null
  if (loading) return <div className="py-12 text-center text-ink-500"><Spinner /> {t('common.loading')}</div>

  const rewarded = list.filter((r) => r.status === 'rewarded')
  const points = profile?.points ?? 0
  const canRedeem = points >= pointsCfg.perExtra
  const qrSrc = shareUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}` : ''

  return (
    <div>
      <PageHeader
        eyebrow={t('referral.title')}
        title={t('referral.title')}
        description={t('referral.subtitle', { points: pointsCfg.perReferral })}
      />

      {alreadySignedInNotice && (
        <div className="mb-4">
          <Alert tone="amber">
            You're already signed in — referral links are for new users signing up. Share your own link below to earn points when friends join.
          </Alert>
        </div>
      )}

      {/* Share card — the main CTA */}
      {profile?.referral_code && (
        <Card className="mb-6 border-brand-200 bg-brand-50">
          <CardBody>
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="min-w-0">
                <div className="text-xs text-brand-700 font-medium mb-0.5">Your referral link</div>
                <div className="font-mono text-sm text-ink-900 break-all">{shareUrl}</div>
                <div className="text-xs text-ink-500 mt-1">
                  Friend earns +{pointsCfg.perWelcome} Diamond Points · You earn +{pointsCfg.perReferral} Diamond Points when they finish onboarding
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              <Button onClick={handleNativeShare} variant="brand" size="sm">
                <ShareIcon /> Share
              </Button>
              <Button onClick={() => copyLink(profile.referral_code!)} variant="ghost" size="sm">
                Copy link
              </Button>
              <button onClick={shareViaWhatsApp} type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors">
                <WhatsAppIcon /> WhatsApp
              </button>
              <button onClick={shareViaTelegram} type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 transition-colors">
                <TelegramIcon /> Telegram
              </button>
              <button onClick={shareViaEmail} type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-ink-200 bg-white text-ink-700 hover:bg-ink-50 transition-colors">
                <EmailIcon /> Email
              </button>
              <button onClick={() => setShowQr((v) => !v)} type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-ink-200 bg-white text-ink-700 hover:bg-ink-50 transition-colors">
                <QrIcon /> {showQr ? 'Hide QR' : 'Show QR'}
              </button>
            </div>

            {showQr && qrSrc && (
              <div className="mt-3 pt-3 border-t border-brand-200 flex flex-col items-center gap-2">
                <img src={qrSrc} alt="Referral QR code" width={200} height={200} className="rounded bg-white p-2 border border-ink-100" />
                <div className="text-xs text-ink-500">Point a phone camera at the QR to open your referral link</div>
              </div>
            )}

            {copyMsg && <div className="mt-3"><Alert tone="green">{copyMsg}</Alert></div>}
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Stat label={t('points.balance')} value={points} tone="brand" hint={`${profile?.points_earned_total ?? 0} earned all time`} />
        <Stat label="Successful referrals" value={rewarded.length} hint={`${rewarded.length * pointsCfg.perReferral} Diamond Points earned`} />
        <Stat label="Pending referrals" value={list.length - rewarded.length} />
      </div>

      <Card className="mb-6">
        <CardBody>
          <h2 className="font-display text-lg mb-1">Send a personalised invite</h2>
          <p className="text-xs text-ink-500 mb-3">
            We tie this code to your friend's email — only they can use it. (For open sharing, use the link above instead.)
          </p>
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
            <EmptyState title="No referrals yet" description="Generate your first invite above, or share the link at the top." />
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
        </CardBody>
      </Card>

      {/* HM redeem — pick a role from a dropdown */}
      {isHM && (
        <Card className="mt-6">
          <CardBody>
            <h2 className="font-display text-lg mb-2">Redeem points for an extra match</h2>
            <p className="text-sm text-ink-600 mb-3">
              Spend {pointsCfg.perExtra} Diamond Points to add 1 extra match slot on a role.
            </p>
            {roles.length === 0 ? (
              <Alert tone="amber">You haven't posted any roles yet. Create one to redeem.</Alert>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                <div className="flex-1 min-w-0">
                  <Select
                    label="Role"
                    value={pickedRoleId}
                    onChange={(e) => setPickedRoleId(e.target.value)}
                  >
                    <option value="">— pick a role —</option>
                    {roles.map((r) => {
                      const full = (r.extra_matches_used ?? 0) >= 3
                      const dim  = r.status !== 'active' || full
                      return (
                        <option key={r.id} value={r.id} disabled={dim}>
                          {r.title} {r.status !== 'active' ? `(${r.status})` : ''}{full ? ' — extra-match cap reached' : ''}
                        </option>
                      )
                    })}
                  </Select>
                </div>
                <Button
                  variant="brand"
                  disabled={!canRedeem || !pickedRoleId || redeeming}
                  loading={redeeming}
                  onClick={() => void redeemForRole()}
                >
                  Redeem {pointsCfg.perExtra} Diamond Points
                </Button>
              </div>
            )}
            {!canRedeem && (
              <p className="text-xs text-ink-500 mt-2">
                You need {pointsCfg.perExtra - points} more Diamond Points. Earn them by referring friends or sharing match feedback.
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {/* Talent redeem — single button, applies to caller's own talent profile */}
      {isTalent && (
        <Card className="mt-6">
          <CardBody>
            <h2 className="font-display text-lg mb-2">Redeem points for an extra match</h2>
            <p className="text-sm text-ink-600 mb-3">
              Spend {pointsCfg.perExtra} Diamond Points to unlock 1 extra match opportunity for yourself (capped at 3 paid extras total).
            </p>
            <Button
              variant="brand"
              disabled={!canRedeem || redeeming}
              loading={redeeming}
              onClick={() => void redeemForTalent()}
            >
              Redeem {pointsCfg.perExtra} Diamond Points → 1 extra match
            </Button>
            {!canRedeem && (
              <p className="text-xs text-ink-500 mt-2">
                You need {pointsCfg.perExtra - points} more Diamond Points. Earn them by referring friends or sharing match feedback.
              </p>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  )
}

/* ---------- icons (inline SVG, no extra deps) ---------- */

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}
function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.198-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
    </svg>
  )
}
function TelegramIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0Zm5.894 8.221-1.97 9.28c-.146.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.022c.243-.213-.054-.334-.373-.121l-6.871 4.326-2.96-.924c-.643-.204-.657-.643.136-.953l11.566-4.458c.538-.196 1.006.128.832.938z"/>
    </svg>
  )
}
function EmailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  )
}
function QrIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <line x1="14" y1="14" x2="14" y2="18" />
      <line x1="18" y1="14" x2="18" y2="14" />
      <line x1="14" y1="22" x2="14" y2="22" />
      <line x1="22" y1="14" x2="22" y2="14" />
      <line x1="22" y1="22" x2="22" y2="22" />
      <line x1="18" y1="18" x2="22" y2="18" />
      <line x1="18" y1="22" x2="18" y2="22" />
    </svg>
  )
}
