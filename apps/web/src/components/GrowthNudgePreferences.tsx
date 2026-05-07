/**
 * GrowthNudgePreferences — talent-facing opt-in for monthly opportunity nudges.
 * Powers Module 4 (proactive job push). Copy is role-neutral and never refers
 * to age, timing, or any internal scoring signal.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../state/useSession'
import { Card, Button } from './ui'

interface State {
  optIn: boolean
  snoozeUntil: string | null
  lastNudgeAt: string | null
}

export default function GrowthNudgePreferences() {
  const { session } = useSession()
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    let cancelled = false
    void supabase.from('talents')
      .select('growth_nudges_opt_in, growth_nudge_snooze_until, last_growth_nudge_at')
      .eq('profile_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const row = data as {
          growth_nudges_opt_in: boolean | null
          growth_nudge_snooze_until: string | null
          last_growth_nudge_at: string | null
        } | null
        setState({
          optIn: Boolean(row?.growth_nudges_opt_in),
          snoozeUntil: row?.growth_nudge_snooze_until ?? null,
          lastNudgeAt: row?.last_growth_nudge_at ?? null,
        })
      })
    return () => { cancelled = true }
  }, [session])

  async function setOptIn(next: boolean) {
    if (!session || !state || busy) return
    setBusy(true); setErr(null)
    try {
      const { error } = await supabase.from('talents')
        .update({ growth_nudges_opt_in: next })
        .eq('profile_id', session.user.id)
      if (error) throw error
      setState({ ...state, optIn: next })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not update preference')
    } finally {
      setBusy(false)
    }
  }

  async function snooze(months: number) {
    if (!session || !state || busy) return
    setBusy(true); setErr(null)
    try {
      const { data, error } = await supabase.rpc('snooze_growth_nudges', { p_months: months })
      if (error) throw error
      setState({ ...state, snoozeUntil: typeof data === 'string' ? data : new Date(Date.now() + months * 30 * 86400000).toISOString() })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not snooze')
    } finally {
      setBusy(false)
    }
  }

  async function clearSnooze() {
    if (!session || !state || busy) return
    setBusy(true); setErr(null)
    try {
      const { error } = await supabase.from('talents')
        .update({ growth_nudge_snooze_until: null })
        .eq('profile_id', session.user.id)
      if (error) throw error
      setState({ ...state, snoozeUntil: null })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not clear snooze')
    } finally {
      setBusy(false)
    }
  }

  if (!state) return null

  const snoozeActive = state.snoozeUntil && new Date(state.snoozeUntil) > new Date()

  return (
    <Card className="mb-6 border-slate-200">
      <div className="p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Opportunity nudges</h2>
            <p className="text-sm text-slate-600 mt-1">
              Get a monthly email with up to 3 roles matched to your profile. You can pause anytime.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={state.optIn}
            disabled={busy}
            onClick={() => void setOptIn(!state.optIn)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
              state.optIn ? 'bg-indigo-600' : 'bg-slate-300'
            } ${busy ? 'opacity-60' : ''}`}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 translate-x-0 rounded-full bg-white shadow ring-0 transition-transform ${
                state.optIn ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>

        {state.optIn && (
          <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
            {snoozeActive ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600">
                  Paused until {new Date(state.snoozeUntil!).toLocaleDateString()}
                </span>
                <Button variant="secondary" size="sm" onClick={() => void clearSnooze()} disabled={busy}>
                  Resume
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-600 mr-2">Pause for:</span>
                <Button variant="secondary" size="sm" onClick={() => void snooze(3)}  disabled={busy}>3 months</Button>
                <Button variant="secondary" size="sm" onClick={() => void snooze(6)}  disabled={busy}>6 months</Button>
                <Button variant="secondary" size="sm" onClick={() => void snooze(12)} disabled={busy}>12 months</Button>
              </div>
            )}
          </div>
        )}

        {err && <p className="mt-3 text-xs text-rose-600">{err}</p>}
      </div>
    </Card>
  )
}
