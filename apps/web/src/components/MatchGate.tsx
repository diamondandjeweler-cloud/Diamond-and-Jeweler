/**
 * MatchGate — shown when a user has exhausted their free match quota.
 * Offers two options: pay via Billplz or redeem Diamond Points.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../state/useSession'
import { supabase } from '../lib/supabase'
import { Alert, Button } from './ui'

interface Props {
  matchType: 'hm_extra' | 'talent_extra'
  roleId?: string
  talentId?: string
  /** Called after successful unlock so the parent can refresh matches. */
  onUnlocked?: () => void
}

export default function MatchGate({ matchType, roleId, talentId, onUnlocked }: Props) {
  const { session, profile, refresh } = useSession()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [mode, setMode] = useState<'idle' | 'paying' | 'redeeming'>('idle')

  const pts = profile?.points ?? 0
  const redemptionCost = 21 // reflected from system_config default; admin can change

  async function payWithBillplz() {
    if (!session) return
    setErr(null); setBusy(true); setMode('paying')
    try {
      const { data: authData } = await supabase.auth.getSession()
      const token = authData.session?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/unlock-extra-match`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ match_type: matchType, role_id: roleId, talent_id: talentId }),
        },
      )
      const data = await res.json() as { paymentUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl
      }
    } catch (e) {
      setErr((e as Error).message)
      setMode('idle')
    } finally {
      setBusy(false)
    }
  }

  async function redeemPoints() {
    if (!session || !roleId) return
    setErr(null); setBusy(true); setMode('redeeming')
    try {
      const { data: authData } = await supabase.auth.getSession()
      const token = authData.session?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/redeem-points`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ role_id: roleId }),
        },
      )
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      await refresh()
      onUnlocked?.()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
      setMode('idle')
    }
  }

  const canRedeem = pts >= redemptionCost && !!roleId

  return (
    <div className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-6 text-center max-w-md mx-auto">
      <div className="mb-2 text-3xl">💎</div>
      <h2 className="font-display text-lg font-bold text-ink-900 mb-1">
        Your 3 free matches are used
      </h2>
      <p className="text-sm text-ink-600 mb-5">
        Unlock your next match by paying or using Diamond Points.
        You currently have <strong>{pts} pts</strong>.
      </p>

      <div className="grid grid-cols-1 gap-3">
        <Button
          onClick={() => void payWithBillplz()}
          loading={busy && mode === 'paying'}
          disabled={busy}
          className="w-full"
          variant="brand"
        >
          Pay RM 9.90 via Billplz FPX
        </Button>

        <Button
          onClick={() => void redeemPoints()}
          loading={busy && mode === 'redeeming'}
          disabled={busy || !canRedeem}
          className="w-full"
        >
          {canRedeem
            ? `Redeem ${redemptionCost} Diamond Points`
            : `Need ${redemptionCost} pts — you have ${pts}`}
        </Button>
      </div>

      <button
        type="button"
        onClick={() => navigate('/points')}
        className="mt-4 text-xs text-brand-600 hover:underline block w-full"
      >
        Earn more Diamond Points →
      </button>

      {err && <div className="mt-3"><Alert tone="red">{err}</Alert></div>}
    </div>
  )
}
