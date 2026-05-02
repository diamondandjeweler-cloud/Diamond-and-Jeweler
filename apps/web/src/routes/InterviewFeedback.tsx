import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../state/useSession'
import { supabase } from '../lib/supabase'
import LoadingSpinner from '../components/LoadingSpinner'

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
  const { session } = useSession()
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
      const { data: match, error } = await supabase
        .from('matches')
        .select('id, status, role_id, talent_id, roles(title, hiring_manager_id)')
        .eq('id', matchId).single()
      if (cancelled) return
      if (error || !match) { setErr(error?.message ?? 'Match not found'); setLoading(false); return }

      const { data: interview } = await supabase
        .from('interviews').select('id, feedback_talent, feedback_manager').eq('match_id', matchId).maybeSingle()
      if (!interview) { setErr('No interview row exists for this match yet.'); setLoading(false); return }

      // Determine side.
      const { data: talent } = await supabase
        .from('talents').select('id, profile_id').eq('id', match.talent_id).maybeSingle()
      const isTalent = talent?.profile_id === session.user.id

      const { data: hm } = await supabase
        .from('hiring_managers')
        .select('id, profile_id')
        .eq('id', (match.roles as unknown as { hiring_manager_id: string } | null)?.hiring_manager_id ?? '')
        .maybeSingle()
      const isHM = hm?.profile_id === session.user.id

      if (!isTalent && !isHM) { setErr('You are not a participant in this match.'); setLoading(false); return }

      const side: Side = isTalent ? 'talent' : 'hm'
      const already =
        side === 'talent' ? interview.feedback_talent != null
                          : interview.feedback_manager != null

      const roleTitle =
        (match.roles as unknown as { title: string } | null)?.title ?? '(role gone)'

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
  }, [matchId, session])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!resolved || !rating || !matchId || !session) return
    setBusy(true); setErr(null)
    const patch: Record<string, unknown> = {}
    if (resolved.side === 'talent') patch.feedback_talent = rating
    else patch.feedback_manager = rating
    if (notes) patch.notes = notes

    const { error } = await supabase.from('interviews')
      .update(patch).eq('id', resolved.interview_id)
    if (error) { setBusy(false); setErr(error.message); return }

    // Insert into the new feedback_submissions table (better audit + drives points).
    // Idempotent: unique (match_id, from_user_id) prevents double-counting.
    const { error: fbErr } = await supabase.from('feedback_submissions').insert({
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
        await supabase.rpc('award_points', {
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
      <button onClick={() => navigate(-1)} className="bg-brand-600 text-white px-4 py-2 rounded">Back</button>
    </div>
  )
  if (!resolved) return null

  if (resolved.already_submitted) {
    return (
      <div className="max-w-lg mx-auto text-center bg-white border rounded-lg p-6">
        <h1 className="text-xl font-semibold mb-2">Feedback already submitted</h1>
        <p className="text-sm text-gray-600 mb-4">
          Thanks! You've already rated this interview for <strong>{resolved.role_title}</strong>.
        </p>
        <button onClick={() => navigate('/home')} className="bg-brand-600 text-white px-4 py-2 rounded">
          Back to dashboard
        </button>
      </div>
    )
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto text-center bg-white border rounded-lg p-6">
        <h1 className="text-xl font-semibold mb-2">Thank you</h1>
        <p className="text-sm text-gray-600">Your feedback helps us improve matches.</p>
        <p className="text-xs text-emerald-700 mt-2">+1 point awarded · 5 points = 1 free extra match.</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <form onSubmit={submit} className="bg-white border rounded-lg p-6 space-y-4">
        <h1 className="text-2xl font-bold mb-1">Rate your interview</h1>
        <p className="text-sm text-gray-600">
          Role: <strong>{resolved.role_title}</strong>
        </p>

        <div>
          <label className="block text-sm mb-2">How did it go? (1 = poor, 5 = excellent)</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className={`w-12 h-12 border rounded text-lg ${
                  rating === n ? 'bg-brand-600 text-white border-brand-600' : 'bg-white hover:bg-gray-50'
                }`}
                aria-label={`Rate ${n} out of 5`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1">Anything else? (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Private to admin — not shown to the other side."
            className="w-full border rounded px-3 py-2"
          />
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <div className="flex gap-2 justify-between pt-2">
          <button type="button" onClick={() => navigate(-1)}
            className="px-4 py-2 border rounded hover:bg-gray-50" disabled={busy}>
            Back
          </button>
          <button type="submit" disabled={busy || !rating}
            className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700 disabled:bg-gray-300">
            {busy ? 'Submitting…' : 'Submit feedback'}
          </button>
        </div>
      </form>
    </div>
  )
}
