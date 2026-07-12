import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '../state/useSession'
import { useShallow } from 'zustand/react/shallow'
import { matchForFeedback } from '../data/repositories/matches'
import { hmProfileLinkById } from '../data/repositories/hiringManagers'
import { talentOwnershipById } from '../data/repositories/talents'
import { updateInterview, interviewFeedbackFlagsByMatch, insertFeedbackSubmission } from '../data/repositories/interviews'
import { awardPoints } from '../data/repositories/points'
import LoadingSpinner from '../components/LoadingSpinner'
import { RadioGroup } from '../ui/RadioGroup'

type Side = 'talent' | 'hm'

interface Resolved {
  side: Side
  interview_id: string
  match_status: string
  already_submitted: boolean
  role_title: string
}

export default function InterviewFeedback() {
  const { matchId } = useParams<{ matchId: string }>()
  const { t } = useTranslation()
  const { session } = useSession(useShallow((s) => ({ session: s.session })))
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [resolved, setResolved] = useState<Resolved | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [rating, setRating] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!matchId || !session) return
    let cancelled = false

    void (async () => {
      // Pull match + interview + ownership info.
      const { data: match, error } = await matchForFeedback(matchId).single()
      if (cancelled) return
      if (error || !match) { setErr(error?.message ?? t('feedback.errMatchNotFound')); setLoading(false); return }

      const { data: interview } = await interviewFeedbackFlagsByMatch(matchId).maybeSingle()
      if (!interview) { setErr(t('feedback.errNoInterview')); setLoading(false); return }

      // Determine side.
      const { data: talent } = await talentOwnershipById(match.talent_id)
      const isTalent = talent?.profile_id === session.user.id

      const { data: hm } = await hmProfileLinkById((match.roles as unknown as { hiring_manager_id: string } | null)?.hiring_manager_id ?? '')
      const isHM = hm?.profile_id === session.user.id

      if (!isTalent && !isHM) { setErr(t('feedback.errNotParticipant')); setLoading(false); return }

      const side: Side = isTalent ? 'talent' : 'hm'
      const already =
        side === 'talent' ? interview.feedback_talent != null
                          : interview.feedback_manager != null

      const roleTitle =
        (match.roles as unknown as { title: string } | null)?.title ?? t('feedback.roleGone')

      setResolved({
        side,
        interview_id: interview.id,
        match_status: match.status,
        already_submitted: already,
        role_title: roleTitle,
      })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [matchId, session, t])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!resolved || !rating || !matchId || !session) return
    setBusy(true); setErr(null)
    const patch: Record<string, unknown> = {}
    if (resolved.side === 'talent') patch.feedback_talent = rating
    else patch.feedback_manager = rating
    if (notes) patch.notes = notes

    const { error } = await updateInterview(resolved.interview_id, patch)
    if (error) { setBusy(false); setErr(error.message); return }

    // Insert into the new feedback_submissions table (better audit + drives points).
    // Idempotent: unique (match_id, from_user_id) prevents double-counting.
    const { error: fbErr } = await insertFeedbackSubmission({
      match_id: matchId,
      from_user_id: session.user.id,
      rating,
      comment: notes || null,
    })
    // If duplicate (already submitted via API), don't award again.
    const isDup = fbErr?.code === '23505'

    if (!fbErr) {
      // Award points (best-effort — failure shouldn't block UI)
      try {
        await awardPoints({
          p_user_id: session.user.id,
          p_delta: 5,
          p_reason: 'feedback_submitted',
          p_reference: { match_id: matchId, side: resolved.side },
          p_idempotency_key: `feedback_legacy:${matchId}:${session.user.id}`,
        })
      } catch { /* tolerate */ }
    } else if (!isDup) {
      // Real error worth surfacing
      setBusy(false); setErr(fbErr.message); return
    }

    setBusy(false)
    setDone(true)
    setTimeout(() => navigate(resolved.side === 'talent' ? '/talent' : '/hm', { replace: true }), 1200)
  }

  if (!session) return <Navigate to="/login" replace />
  if (loading) return <LoadingSpinner />
  if (err) return (
    <div className="max-w-lg mx-auto text-center">
      <p className="text-red-600 mb-4">{err}</p>
      <button onClick={() => navigate(-1)} className="bg-brand-600 text-white px-4 py-2 rounded">{t('feedback.back')}</button>
    </div>
  )
  if (!resolved) return null

  if (resolved.already_submitted) {
    return (
      <div className="max-w-lg mx-auto text-center bg-white border rounded-lg p-6">
        <h1 className="text-xl font-semibold mb-2">{t('feedback.alreadySubmitted')}</h1>
        <p className="text-sm text-gray-600 mb-4">
          {t('feedback.alreadyRated', { role: resolved.role_title })}
        </p>
        <button onClick={() => navigate('/home')} className="bg-brand-600 text-white px-4 py-2 rounded">
          {t('feedback.backToDashboard')}
        </button>
      </div>
    )
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto text-center bg-white border rounded-lg p-6">
        <h1 className="text-xl font-semibold mb-2">{t('feedback.thankYou')}</h1>
        <p className="text-sm text-gray-600">{t('feedback.thankYouBody')}</p>
        <p className="text-xs text-emerald-700 mt-2">{t('feedback.pointsNote')}</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <form onSubmit={submit} className="bg-white border rounded-lg p-6 space-y-4">
        <h1 className="text-2xl font-bold mb-1">{t('feedback.title')}</h1>
        <p className="text-sm text-gray-600">
          {t('feedback.role')}: <strong>{resolved.role_title}</strong>
        </p>

        <div>
          <div id="rating-question" className="block text-sm mb-2">{t('feedback.ratingQuestion')}</div>
          <RadioGroup
            variant="segmented"
            aria-labelledby="rating-question"
            orientation="horizontal"
            value={rating != null ? String(rating) : ''}
            onValueChange={(v) => setRating(Number(v))}
            className="flex gap-2"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <RadioGroup.Item
                key={n}
                value={String(n)}
                size="tile"
                aria-label={t('feedback.rateAria', { n })}
                label={n}
                // Parity overrides for this legacy non-tokenised `bg-white` card:
                // brand-600 fill (vs the variant's brand-500) + white/gray-200 resting.
                className="data-[state=unchecked]:bg-white data-[state=unchecked]:border-gray-200 data-[state=unchecked]:text-inherit data-[state=unchecked]:hover:bg-gray-50 data-[state=checked]:bg-brand-600 data-[state=checked]:border-brand-600"
              />
            ))}
          </RadioGroup>
        </div>

        <div>
          <label htmlFor="interview-notes" className="block text-sm mb-1">{t('feedback.commentLabel')}</label>
          <textarea
            id="interview-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder={t('feedback.notePlaceholder')}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <div className="flex gap-2 justify-between pt-2">
          <button type="button" onClick={() => navigate(-1)}
            className="px-4 py-2 border rounded hover:bg-gray-50" disabled={busy}>
            {t('feedback.back')}
          </button>
          <button type="submit" disabled={busy || !rating}
            className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700 disabled:bg-gray-300">
            {busy ? t('feedback.submitting') : t('feedback.submit')}
          </button>
        </div>
      </form>
    </div>
  )
}
