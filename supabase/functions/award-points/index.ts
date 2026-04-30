/**
 * award-points
 *
 * Awards Diamond Points for match-lifecycle events. Called by the frontend
 * after confirmed user actions. To prevent double-credit, the caller MUST
 * supply either:
 *   - match_id  → key = `${event_type}:${match_id}` (one credit per event per match)
 *   - idempotency_key → caller-supplied (e.g., review submission UUID)
 *
 * event_type values and earn rates (from system_config):
 *   reject_with_reason   — talent/HM rejected a proposed match and gave reason
 *   accept_interview     — match accepted, interview confirmed
 *   interviewer_rejects  — HM rejected talent after interview (consolation to talent)
 *   end_review           — user submitted an end-to-end review
 *
 * For event_types tied to a specific match, we ALSO verify the match exists
 * and the caller participates in it before crediting.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

type EventType =
  | 'reject_with_reason'
  | 'accept_interview'
  | 'interviewer_rejects'
  | 'end_review'

interface Body {
  event_type: EventType
  match_id?: string
  idempotency_key?: string
}

const CONFIG_KEY: Record<EventType, string> = {
  reject_with_reason:  'earn_reject_with_reason',
  accept_interview:    'earn_accept_interview',
  interviewer_rejects: 'earn_interviewer_rejects',
  end_review:          'earn_end_review',
}

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, {
    requiredRoles: ['talent', 'hiring_manager', 'admin'],
  })
  if (auth instanceof Response) return auth

  let body: Body
  try { body = (await req.json()) as Body }
  catch { return json({ error: 'Invalid JSON' }, 400) }

  const { event_type, match_id, idempotency_key } = body
  if (!event_type || !CONFIG_KEY[event_type]) {
    return json({ error: `Unknown event_type: ${event_type}` }, 400)
  }
  if (!match_id && !idempotency_key) {
    return json({ error: 'Either match_id or idempotency_key required' }, 400)
  }

  const db = adminClient()

  // If a match_id is supplied, verify the match exists AND the caller is a
  // participant (talent on it, or HM owning the role). This blocks crafted
  // calls that name an arbitrary match the caller doesn't own.
  if (match_id) {
    const { data: m } = await db.from('matches')
      .select('id, role_id, talent_id, roles!inner(hiring_manager_id, hiring_managers!inner(profile_id)), talents!inner(profile_id)')
      .eq('id', match_id).maybeSingle()
    if (!m) return json({ error: 'Match not found' }, 404)
    if (auth.role !== 'admin') {
      const talentProfileId = (m as unknown as { talents?: { profile_id: string } })?.talents?.profile_id
      const hmProfileId = (m as unknown as { roles?: { hiring_managers?: { profile_id: string } } })?.roles?.hiring_managers?.profile_id
      const isParticipant = talentProfileId === auth.userId || hmProfileId === auth.userId
      if (!isParticipant) return json({ error: 'Not a participant of this match' }, 403)
    }
  }

  // Read earn rate from system_config.
  const { data: cfg } = await db.from('system_config').select('value')
    .eq('key', CONFIG_KEY[event_type]).maybeSingle()
  const pts = typeof cfg?.value === 'number' ? cfg.value : 5
  if (pts <= 0) return json({ message: 'Earn rate is zero — no points awarded' })

  const key = idempotency_key ?? `${event_type}:${match_id}`

  const { data: awarded, error } = await db.rpc('award_points', {
    p_user_id: auth.userId,
    p_delta: pts,
    p_reason: event_type,
    p_reference: match_id ? { match_id } : {},
    p_idempotency_key: key,
  })
  if (error) return json({ error: error.message }, 500)
  if (awarded === 0) return json({ message: 'Already awarded', already: true })

  return json({ message: 'Awarded', points: pts })
})
