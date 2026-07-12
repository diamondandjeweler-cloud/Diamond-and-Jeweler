/**
 * award-points
 *
 * Awards Diamond Points for match-lifecycle events. Called by the frontend
 * after confirmed user actions. Every event is per-match, so the caller MUST
 * supply a match_id → the idempotency key is SERVER-DERIVED as
 * `${event_type}:${match_id}` (one credit per event per match). This prevents
 * both double-credit AND point farming: a caller-supplied idempotency key with
 * no match_id would let a talent/HM self-credit unbounded points by sending a
 * fresh key each call (finding money-2), so that path is closed.
 *
 * event_type values and earn rates (from system_config):
 *   reject_with_reason   — talent/HM rejected a proposed match and gave reason
 *   accept_interview     — match accepted, interview confirmed
 *   interviewer_rejects  — HM rejected talent after interview (consolation to talent)
 *   end_review           — user submitted an end-to-end review
 *
 * The match is ALWAYS verified to exist and the caller verified as a participant
 * before crediting.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'
import { reportError } from '../_shared/observe.ts'
import { type AwardPointsBody, CONFIG_KEY, type EventType, validateAwardPointsRequest } from './validate.ts'

// Wrapped so any uncaught throw in the handler is reported to the edge error
// sink before propagating. Re-throws unchanged — status/response/control flow
// are byte-for-byte identical to the bare handler (purely additive telemetry).
serve(async (req) => {
  try {
    return await handler(req)
  } catch (e) {
    await reportError(e, { fn: 'award-points' })
    throw e
  }
})

async function handler(req: Request): Promise<Response> {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, {
    requiredRoles: ['talent', 'hiring_manager', 'admin'],
  })
  if (auth instanceof Response) return auth

  let body: AwardPointsBody
  try { body = (await req.json()) as AwardPointsBody }
  catch { return json({ error: 'Invalid JSON' }, 400) }

  // money-2: reject unknown event_type AND require match_id for ALL events, so
  // every credit is keyed on a server-derived `${event_type}:${match_id}` and
  // goes through participation verification. No caller-supplied idempotency-key
  // (no-match) farming path exists.
  const invalid = validateAwardPointsRequest(body)
  if (invalid) return json({ error: invalid.error }, invalid.status)
  const { event_type, match_id } = body as { event_type: EventType; match_id: string }

  const db = adminClient()

  // match_id is guaranteed present (validateAwardPointsRequest). Verify the match
  // exists AND the caller is a participant (talent on it, or HM owning the role).
  // This blocks crafted calls that name an arbitrary match the caller doesn't own.
  let talentProfileId: string | undefined
  let hmProfileId: string | undefined
  const { data: m } = await db.from('matches')
    .select('id, role_id, talent_id, roles!inner(hiring_manager_id, hiring_managers!inner(profile_id)), talents!inner(profile_id)')
    .eq('id', match_id).maybeSingle()
  if (!m) return json({ error: 'Match not found' }, 404)
  talentProfileId = (m as unknown as { talents?: { profile_id: string } })?.talents?.profile_id
  hmProfileId = (m as unknown as { roles?: { hiring_managers?: { profile_id: string } } })?.roles?.hiring_managers?.profile_id
  if (auth.role !== 'admin') {
    const isParticipant = talentProfileId === auth.userId || hmProfileId === auth.userId
    if (!isParticipant) return json({ error: 'Not a participant of this match' }, 403)
    // Prevent talent from calling interviewer_rejects to self-credit: this
    // event type is a consolation award initiated by the HM, not the talent.
    if (event_type === 'interviewer_rejects' && talentProfileId === auth.userId) {
      return json({ error: 'Only the interviewer can award this event type' }, 403)
    }
  }

  // Read earn rate from system_config.
  const { data: cfg } = await db.from('system_config').select('value')
    .eq('key', CONFIG_KEY[event_type]).maybeSingle()
  const pts = typeof cfg?.value === 'number' ? cfg.value : 5
  if (pts <= 0) return json({ message: 'Earn rate is zero — no points awarded' })

  // interviewer_rejects is a consolation award to the TALENT, called by the
  // HM. All other event_types credit the caller.
  const recipient = event_type === 'interviewer_rejects' && talentProfileId
    ? talentProfileId
    : auth.userId

  // Server-derive the idempotency key from match_id so a client cannot bypass the
  // one-credit-per-event-per-match guard by sending a fresh key on each call
  // (point farming). match_id is mandatory (validated above), so the key is always
  // server-controlled — there is no caller-supplied-key path.
  //
  // accept_interview and reject_with_reason are the two MUTUALLY-EXCLUSIVE
  // outcomes of the talent's decision on a proposed match — a match is accepted
  // OR rejected, never both. They therefore share ONE idempotency namespace per
  // match ('match_decision:<id>'), so a client cannot claim BOTH accept and
  // reject points for the same match by exploiting the per-event-type key.
  // interviewer_rejects / end_review are later, independent lifecycle stages and
  // keep their own per-event namespaces.
  const MUTUALLY_EXCLUSIVE: Partial<Record<EventType, string>> = {
    accept_interview:   'match_decision',
    reject_with_reason: 'match_decision',
  }
  const keyNamespace = MUTUALLY_EXCLUSIVE[event_type] ?? event_type
  const key = `${keyNamespace}:${match_id}`

  const { data: awarded, error } = await db.rpc('award_points', {
    p_user_id: recipient,
    p_delta: pts,
    p_reason: event_type,
    p_reference: { match_id },
    p_idempotency_key: key,
  })
  if (error) return json({ error: error.message }, 500)
  if (awarded === 0) return json({ message: 'Already awarded', already: true })

  return json({ message: 'Awarded', points: pts })
}
