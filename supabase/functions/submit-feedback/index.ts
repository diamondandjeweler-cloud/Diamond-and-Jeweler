/**
 * submit-feedback
 *
 * Unified feedback submission for all 6 lifecycle stages.
 * Handles both HM→talent and talent→HM directions.
 *
 * On each call:
 *   1. Inserts into match_feedback_events (idempotent via upsert)
 *   2. If from_party='hm' + stage='interview': syncs to match_feedback (backward compat)
 *   3. If free_text present: calls extract-feedback-tags inline, stores result
 *   4. Recomputes reputation_score + feedback_volume for the reviewed party
 *   5. Merges feedback_tags into the reviewed party's profile (stage-weighted avg)
 *   6. Awards Diamond Points to the submitter (once per match+stage+party)
 *   7. Logs to match_outcomes when outcome carries hire/retention signal
 *
 * Diamond Points by stage:
 *   interview=5  offer=5  day_30=10  probation=20  6_month=30  1_year=50
 *
 * Auth: talent or hiring_manager (or admin).
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

interface Body {
  match_id: string
  stage: string          // 'interview'|'offer'|'day_30'|'probation'|'6_month'|'1_year'
  from_party: string     // 'hm'|'talent'
  rating?: number        // 1–5
  outcome?: string
  free_text?: string
}

// Stage weights for reputation_score averaging (later stages = higher credibility)
const STAGE_WEIGHT: Record<string, number> = {
  interview: 1, offer: 2, day_30: 4, probation: 8, '6_month': 16, '1_year': 32,
}
const POINTS: Record<string, number> = {
  interview: 5, offer: 5, day_30: 10, probation: 20, '6_month': 30, '1_year': 50,
}
// Outcomes that should be logged as match_outcomes for PHS calibration
const OUTCOME_LOG_MAP: Record<string, string> = {
  no_show: 'no_show', great_hire: 'hired', hired_left_early: 'quit_3m',
  offer_declined: 'declined', accepted_offer: 'accepted',
  company_ghosted: 'no_show_hm', passed_probation: 'passed_probation',
  failed_probation: 'failed_probation', still_employed_6m: 'employed_6m',
  still_employed_1y: 'employed_1y',
}

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, { requiredRoles: ['talent', 'hiring_manager', 'admin'] })
  if (auth instanceof Response) return auth

  let body: Body
  try { body = await req.json() as Body } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!body.match_id || !body.stage || !body.from_party) {
    return json({ error: 'match_id, stage, from_party are required' }, 400)
  }

  const db = adminClient()

  // Resolve the match + verify caller has the right to submit this feedback direction
  const { data: match } = await db.from('matches')
    .select('id, talent_id, role_id, roles!inner(hiring_manager_id, hiring_managers!inner(id, profile_id))')
    .eq('id', body.match_id).maybeSingle()
  if (!match) return json({ error: 'Match not found' }, 404)

  const hmProfileId = (match as unknown as {
    roles: { hiring_managers: { profile_id: string; id: string } }
  }).roles.hiring_managers.profile_id
  const hmId = (match as unknown as {
    roles: { hiring_managers: { id: string } }
  }).roles.hiring_managers.id

  // Auth gate: 'hm' submissions must come from the HM of this match's role;
  //            'talent' submissions from the talent on this match.
  if (auth.role !== 'admin') {
    if (body.from_party === 'hm' && auth.userId !== hmProfileId) {
      return json({ error: 'Not the hiring manager for this match' }, 403)
    }
    if (body.from_party === 'talent') {
      const { data: tal } = await db.from('talents')
        .select('id').eq('id', match.talent_id).eq('profile_id', auth.userId).maybeSingle()
      if (!tal) return json({ error: 'Not the talent on this match' }, 403)
    }
  }

  // ── Upsert feedback event ─────────────────────────────────────────────────
  const { data: existing } = await db.from('match_feedback_events')
    .select('id, diamond_points_awarded')
    .eq('match_id', body.match_id).eq('stage', body.stage).eq('from_party', body.from_party)
    .maybeSingle()

  const isNew = !existing
  const pointsAwarded = isNew ? (POINTS[body.stage] ?? 5) : 0

  const { error: upsertErr } = await db.from('match_feedback_events').upsert({
    match_id: body.match_id,
    stage: body.stage,
    from_party: body.from_party,
    rating: body.rating ?? null,
    outcome: body.outcome ?? null,
    free_text: body.free_text?.trim() || null,
    diamond_points_awarded: pointsAwarded,
    created_at: existing ? undefined : new Date().toISOString(),
  }, { onConflict: 'match_id,stage,from_party' })
  if (upsertErr) return json({ error: upsertErr.message }, 500)

  // ── Backward compat: sync HM interview feedback to match_feedback ─────────
  if (body.from_party === 'hm' && body.stage === 'interview') {
    await db.from('match_feedback').upsert({
      match_id: body.match_id,
      rating: body.rating ?? null,
      hired: body.outcome === 'great_hire',
      notes: body.free_text?.trim() || null,
      outcome: body.outcome ?? null,
      diamond_points_awarded: pointsAwarded,
    }, { onConflict: 'match_id' })
  }

  // ── Extract tags from free_text (true fire-and-forget — never block the user) ──
  const feedbackTags: Record<string, number> | null = null
  const theme: string | null = null
  if (body.free_text && body.free_text.trim().length >= 10) {
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/extract-feedback-tags`
    const matchId = body.match_id
    const stage = body.stage
    const fromParty = body.from_party
    // Fire without awaiting — tags are written back to match_feedback_events
    // by the extract-feedback-tags function itself when it completes.
    fetch(fnUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
      body: JSON.stringify({ free_text: body.free_text, stage, from_party: fromParty, match_id: matchId }),
    }).catch(() => { /* best-effort */ })
  }

  // ── Recompute reputation for the reviewed party ───────────────────────────
  const reviewedParty = body.from_party === 'hm' ? 'talent' : 'hm'
  await recomputeReputation(db, body.match_id, reviewedParty, match.talent_id, hmId, feedbackTags, body.stage, body.rating)

  // ── Recompute HM quality factor when talent reviews the employer ──────────
  // Prevents good talent from appearing "bad" due to bad HM behaviour.
  if (reviewedParty === 'hm') {
    await recomputeHMQuality(db, hmId)
  }

  // ── Award Diamond Points to submitter ────────────────────────────────────
  // Use award_points RPC so profiles.points (spendable balance) and
  // points_earned_total stay in sync — the wallet UI reads `points`.
  if (isNew && pointsAwarded > 0) {
    await db.rpc('award_points', {
      p_user_id: auth.userId,
      p_delta: pointsAwarded,
      p_reason: 'feedback_submitted',
      p_reference: { match_id: body.match_id, stage: body.stage, from_party: body.from_party },
      p_idempotency_key: `feedback:${body.match_id}:${body.stage}:${body.from_party}`,
    })
  }

  // ── Log outcome for PHS calibration ──────────────────────────────────────
  const outcomeCode = body.outcome ? OUTCOME_LOG_MAP[body.outcome] : null
  if (outcomeCode) {
    try {
      const { error: outcomeErr } = await db.from('match_outcomes').upsert({
        match_id: body.match_id,
        outcome: outcomeCode,
        recorded_by: body.from_party,
      }, { onConflict: 'match_id,outcome' })
      if (outcomeErr) console.error('match_outcomes upsert error:', outcomeErr)
    } catch (e) {
      console.error('match_outcomes upsert threw:', e)
    }
  }

  return new Response(JSON.stringify({
    success: true,
    is_new: isNew,
    points_awarded: pointsAwarded,
    feedback_tags: feedbackTags,
    theme,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})

async function recomputeHMQuality(
  db: ReturnType<typeof adminClient>,
  hmId: string,
) {
  // All matches for this HM (via role ownership)
  const { data: hmMatches } = await db.from('matches')
    .select('id, status, roles!inner(hiring_manager_id)')
    .eq('roles.hiring_manager_id', hmId)
  if (!hmMatches || hmMatches.length === 0) return

  const ids = (hmMatches as Array<{ id: string; status: string }>).map((m) => m.id)

  // ── Cancel rate: company ghosted outcomes / matches HM invited ─────────────
  const invitedStatuses = ['invited_by_manager','hr_scheduling','interview_scheduled','interview_completed','offer_made','hired']
  const invitedCount = (hmMatches as Array<{ id: string; status: string }>)
    .filter((m) => invitedStatuses.includes(m.status)).length

  const { data: outcomes } = await db.from('match_outcomes')
    .select('match_id, outcome').in('match_id', ids)
  const outcomeList = (outcomes ?? []) as Array<{ match_id: string; outcome: string }>

  const hmNoShows = outcomeList.filter((o) => o.outcome === 'no_show_hm').length
  const cancelRate = invitedCount >= 2 ? hmNoShows / invitedCount : null

  // ── Offer rate: did HM make offer after interview? ────────────────────────
  // Proxy: matches that have interview feedback from HM = interview happened.
  const { data: hmInterviewFb } = await db.from('match_feedback_events')
    .select('match_id').in('match_id', ids).eq('from_party', 'hm').eq('stage', 'interview')
  const interviewedIds = new Set((hmInterviewFb ?? []).map((f: { match_id: string }) => f.match_id))
  const offerOutcomeIds = new Set(
    outcomeList.filter((o) => ['accepted','declined','hired'].includes(o.outcome)).map((o) => o.match_id)
  )
  const offersFromInterviews = [...offerOutcomeIds].filter((id) => interviewedIds.has(id)).length
  const offerRate = interviewedIds.size >= 2 ? offersFromInterviews / interviewedIds.size : null

  // ── Offer accept rate & retention from match_outcomes ─────────────────────
  const accepted = outcomeList.filter((o) => o.outcome === 'accepted').length
  const declined = outcomeList.filter((o) => o.outcome === 'declined').length
  const offerAcceptRate = (accepted + declined) >= 2 ? accepted / (accepted + declined) : null

  const hired = outcomeList.filter((o) => o.outcome === 'hired').length
  const employed6m = outcomeList.filter((o) => o.outcome === 'employed_6m').length
  const retentionRate = hired >= 2 ? employed6m / hired : null

  // ── Truthfulness: avg talent rating / 5 ──────────────────────────────────
  const { data: talentRatings } = await db.from('match_feedback_events')
    .select('rating').in('match_id', ids).eq('from_party', 'talent').not('rating', 'is', null)
  const truthfulness = talentRatings && talentRatings.length >= 2
    ? (talentRatings as Array<{ rating: number }>).reduce((s, r) => s + r.rating, 0) / talentRatings.length / 5.0
    : null

  // ── Composite quality factor ──────────────────────────────────────────────
  // Only compute when we have at least one data signal.
  const hasData = cancelRate != null || offerAcceptRate != null || retentionRate != null || truthfulness != null
  let hmQualityFactor: number | null = null
  if (hasData) {
    const composite = (
      (1.0 - (cancelRate ?? 0.10)) * 0.30 +   // reliability
      (offerAcceptRate    ?? 0.50) * 0.25 +    // JD honesty proxy
      (retentionRate      ?? 0.50) * 0.30 +    // environment quality
      (truthfulness       ?? 0.50) * 0.15      // role-as-described
    )
    hmQualityFactor = 0.70 + 0.30 * Math.max(0, Math.min(1, composite))
  }

  await db.from('hiring_managers').update({
    hm_cancel_rate:       cancelRate,
    hm_offer_rate:        offerRate,
    phs_offer_accept_rate: offerAcceptRate,
    phs_retention_rate:   retentionRate,
    phs_truthfulness_score: truthfulness,
    hm_quality_factor:    hmQualityFactor,
  }).eq('id', hmId)
}

async function recomputeReputation(
  db: ReturnType<typeof adminClient>,
  matchId: string,
  reviewedParty: 'talent' | 'hm',
  talentId: string,
  hmId: string,
  newTags: Record<string, number> | null,
  newStage: string,
  newRating?: number,
) {
  // Get all feedback events for the reviewed party across all matches
  let eventsQuery = db.from('match_feedback_events')
    .select('rating, stage, feedback_tags, match_id')
    .eq('from_party', reviewedParty === 'talent' ? 'hm' : 'talent')  // reviews OF this party

  if (reviewedParty === 'talent') {
    // Reviews of talent: from HMs, where match's talent_id = talentId
    const { data: talentMatchIds } = await db.from('matches')
      .select('id').eq('talent_id', talentId)
    const ids = (talentMatchIds ?? []).map((m: { id: string }) => m.id)
    if (ids.length === 0) return
    eventsQuery = eventsQuery.in('match_id', ids)
  } else {
    // Reviews of HM: from talents, where match's role belongs to hmId
    const { data: hmMatchIds } = await db.from('matches')
      .select('id, roles!inner(hiring_manager_id)')
      .eq('roles.hiring_manager_id', hmId)
    const ids = (hmMatchIds ?? []).map((m: { id: string }) => m.id)
    if (ids.length === 0) return
    eventsQuery = eventsQuery.in('match_id', ids)
  }

  const { data: allEvents } = await eventsQuery
  if (!allEvents || allEvents.length === 0) return

  // Compute stage-weighted reputation_score (0–100)
  let weightedSum = 0
  let totalWeight = 0
  const tagAccum: Record<string, { sum: number; totalW: number }> = {}

  for (const evt of allEvents as Array<{ rating: number | null; stage: string; feedback_tags: Record<string, number> | null }>) {
    const w = STAGE_WEIGHT[evt.stage] ?? 1
    if (evt.rating != null) { weightedSum += evt.rating * w * 20; totalWeight += w }  // /5 * 100 = *20
    if (evt.feedback_tags) {
      for (const [k, v] of Object.entries(evt.feedback_tags)) {
        if (!tagAccum[k]) tagAccum[k] = { sum: 0, totalW: 0 }
        tagAccum[k].sum += v * w
        tagAccum[k].totalW += w
      }
    }
  }

  const reputationScore = totalWeight > 0 ? weightedSum / totalWeight : null
  const aggregatedTags: Record<string, number> = {}
  for (const [k, { sum, totalW }] of Object.entries(tagAccum)) {
    aggregatedTags[k] = sum / totalW
  }

  const feedbackVolume = allEvents.length

  if (reviewedParty === 'talent') {
    await db.from('talents').update({
      reputation_score: reputationScore,
      feedback_tags: Object.keys(aggregatedTags).length > 0 ? aggregatedTags : null,
      feedback_volume: feedbackVolume,
    }).eq('id', talentId)
  } else {
    await db.from('hiring_managers').update({
      reputation_score: reputationScore,
      feedback_tags: Object.keys(aggregatedTags).length > 0 ? aggregatedTags : null,
      feedback_volume: feedbackVolume,
    }).eq('id', hmId)
  }
}
