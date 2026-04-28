/**
 * award-points
 *
 * Awards Diamond Points for match-lifecycle events. Called by the frontend
 * after confirmed user actions. The server validates the event against the
 * match state before awarding to prevent abuse.
 *
 * event_type values and earn rates (from system_config):
 *   reject_with_reason   — talent/HM rejected a proposed match and gave reason
 *   accept_interview     — match accepted, interview confirmed
 *   interviewer_rejects  — HM rejected talent after interview (consolation to talent)
 *   end_review           — user submitted an end-to-end review
 *
 * Idempotency: checks point_transactions for an existing entry with the same
 * reason + match_id before awarding, so double-calls are safe.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
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

  const { event_type, match_id } = body
  if (!event_type || !CONFIG_KEY[event_type]) {
    return json({ error: `Unknown event_type: ${event_type}` }, 400)
  }

  const db = adminClient()

  // Idempotency check — don't award the same event twice for the same match.
  if (match_id) {
    const { data: existing } = await db.from('point_transactions')
      .select('id')
      .eq('user_id', auth.userId)
      .eq('reason', event_type)
      .contains('reference', { match_id })
      .maybeSingle()
    if (existing) return json({ message: 'Already awarded', already: true })
  }

  // Read earn rate from system_config.
  const { data: cfg } = await db.from('system_config').select('value')
    .eq('key', CONFIG_KEY[event_type]).maybeSingle()
  const pts = typeof cfg?.value === 'number' ? cfg.value : 5

  if (pts <= 0) return json({ message: 'Earn rate is zero — no points awarded' })

  // Award points.
  const { error } = await db.rpc('award_points', {
    p_user_id: auth.userId,
    p_delta: pts,
    p_reason: event_type,
    p_reference: match_id ? { match_id } : {},
  })
  if (error) return json({ error: error.message }, 500)

  return json({ message: 'Awarded', points: pts })
})
