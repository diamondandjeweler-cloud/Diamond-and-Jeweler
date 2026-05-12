/**
 * CareerNudgePanel — generic career advisory copy shown to the signed-in
 * user. Driven by an internal nudge category; never reveals the underlying
 * scoring method, stages, characters, or any year-cycle vocabulary.
 *
 * Categories:
 *   skill_dev — invest in courses / upskilling
 *   move_fast — strong window to act on matches
 *   (ramp_up is HR-facing only; never surfaced to the talent here)
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../state/useSession'
import { Card } from './ui'
import type { CareerNudge } from '../lib/yearLuck'

interface Props {
  side: 'talent' | 'hm'
}

export default function CareerNudgePanel({ side }: Props) {
  const { session } = useSession()
  const [nudge, setNudge] = useState<CareerNudge>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!session) return
    let cancelled = false
    void supabase.rpc('get_career_nudge', { p_year: new Date().getFullYear() })
      .then(({ data }) => {
        if (cancelled) return
        setNudge((data as CareerNudge) ?? null)
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [session])

  if (!loaded || !nudge) return null

  if (nudge === 'skill_dev') {
    return (
      <Card className="mb-6 border-sky-200 bg-sky-50">
        <div className="p-5 md:p-6">
          <h2 className="text-base font-semibold text-sky-900 mb-1">Suggested focus: skill development</h2>
          <p className="text-sm text-sky-800">
            This is a strong period to invest in your skills — consider a short course or certification to strengthen
            your profile for upcoming opportunities. Want tailored 1-on-1 advice?
          </p>
          <Link
            to="/consult"
            className="mt-3 inline-block text-xs font-semibold text-sky-900 underline underline-offset-2 hover:text-sky-700"
          >
            Book a private 1-on-1 career consult →
          </Link>
        </div>
      </Card>
    )
  }

  if (nudge === 'move_fast') {
    const verb = side === 'talent' ? 'review your matches and act quickly' : 'move on candidates while the window is open'
    return (
      <Card className="mb-6 border-emerald-200 bg-emerald-50">
        <div className="p-5 md:p-6">
          <h2 className="text-base font-semibold text-emerald-900 mb-1">Strong window to make a move</h2>
          <p className="text-sm text-emerald-800">
            Conditions look favourable right now — {verb}. Decisions made in the near term tend to land well.
          </p>
        </div>
      </Card>
    )
  }

  return null
}
