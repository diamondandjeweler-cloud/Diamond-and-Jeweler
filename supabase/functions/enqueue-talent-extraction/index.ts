/**
 * enqueue-talent-extraction
 *
 * Async wrapper around the LLM extraction. Returns 202 immediately so the
 * onboarding UI isn't blocked behind a 30–90s LLM call (the synchronous
 * version made users panic-refresh and corrupted state).
 *
 * Flow:
 *   1. Auth caller (must be the talent owner of the row).
 *   2. Mark talents.extraction_status = 'processing'.
 *   3. Return 202 to client.
 *   4. EdgeRuntime.waitUntil(...) runs the LLM call after the response is
 *      flushed, then UPDATEs the talents row with extracted fields and
 *      flips extraction_status='complete' + is_open_to_offers=true.
 *
 * Failure path: extraction_status='failed', extraction_error populated.
 * Backstop: retry-stuck-extractions cron picks up rows stuck in
 * 'pending'/'processing' for >10 min.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'
import {
  ExtractionError,
  runExtraction,
  type ExtractionMessage,
  type ExtractedProfile,
} from '../_shared/talent-extraction.ts'
import { matchForRole, MatchError } from '../_shared/match-core.ts'

interface Body {
  talent_id?: string
  messages?: ExtractionMessage[]
  resume_text?: string
}

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined

serve(async (req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const auth = await authenticate(req, { requiredRoles: ['talent', 'admin'] })
  if (auth instanceof Response) return auth

  let body: Body = {}
  try { body = await req.json() } catch { /* empty */ }

  const talentId = body.talent_id?.trim()
  if (!talentId) return json({ error: 'talent_id required' }, 400)

  const db = adminClient()

  // Verify ownership + load transcript from the row when not provided in body.
  // The retry-from-profile path sends just { talent_id } and relies on the
  // transcript already stored in talents.interview_answers.
  const { data: row, error: fetchErr } = await db
    .from('talents')
    .select('id, profile_id, extraction_status, interview_answers')
    .eq('id', talentId)
    .maybeSingle()
  if (fetchErr) return json({ error: fetchErr.message }, 500)
  if (!row) return json({ error: 'Talent not found' }, 404)
  if (!auth.isServiceRole && row.profile_id !== auth.userId) {
    return json({ error: 'Forbidden' }, 403)
  }
  if (row.extraction_status === 'processing') {
    return json({ status: 'already_processing' }, 202)
  }

  let messages: ExtractionMessage[] = Array.isArray(body.messages) ? body.messages : []
  if (messages.length === 0) {
    const stored = (row.interview_answers as { transcript?: ExtractionMessage[] } | null)?.transcript
    if (Array.isArray(stored) && stored.length > 0) messages = stored
  }
  if (messages.length === 0) return json({ error: 'No transcript available' }, 400)

  // Claim the row so duplicate enqueues are no-ops.
  const { error: claimErr } = await db
    .from('talents')
    .update({
      extraction_status: 'processing',
      extraction_started_at: new Date().toISOString(),
      extraction_error: null,
    })
    .eq('id', talentId)
  if (claimErr) return json({ error: `Claim failed: ${claimErr.message}` }, 500)

  // Fire the actual extraction in the background. waitUntil keeps the
  // worker alive after the 202 response is returned.
  const work = processExtraction(talentId, messages, body.resume_text)

  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    EdgeRuntime.waitUntil(work)
  } else {
    // Local dev fallback: just don't await it. Errors are still logged inside.
    work.catch((err) => console.error('[enqueue-talent-extraction] background error:', err))
  }

  return json({ status: 'accepted', talent_id: talentId }, 202)
})

async function processExtraction(
  talentId: string,
  messages: ExtractionMessage[],
  resumeText?: string,
): Promise<void> {
  const db = adminClient()
  try {
    const extracted = await runExtraction(messages, resumeText)
    const patch = buildTalentPatch(extracted)
    const { error } = await db
      .from('talents')
      .update({
        ...patch,
        extraction_status: 'complete',
        extraction_completed_at: new Date().toISOString(),
        extraction_error: null,
        is_open_to_offers: true,
      })
      .eq('id', talentId)
    if (error) throw error
    console.log(`[enqueue-talent-extraction] talent=${talentId} complete`)

    // Now that the talent is matchable, enqueue active roles for rematch and
    // kick the queue worker. The 2-min cron is a safety net; this gets the
    // new talent in front of HMs within one matcher cycle.
    await triggerRematch(talentId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[enqueue-talent-extraction] talent=${talentId} FAILED: ${msg}`)
    await db
      .from('talents')
      .update({
        extraction_status: 'failed',
        extraction_error: msg.slice(0, 1000),
      })
      .eq('id', talentId)
      .then(({ error }) => {
        if (error) console.error('[enqueue-talent-extraction] failed-mark error:', error)
      })
  }
}

async function triggerRematch(talentId: string): Promise<void> {
  const db = adminClient()
  try {
    // Fetch the most recently-active roles. Bounded; we don't want to
    // hammer the matcher for every onboarding completion.
    const { data: roles, error } = await db
      .from('roles')
      .select('id, updated_at')
      .eq('status', 'active')
      .or('vacancy_expires_at.is.null,vacancy_expires_at.gt.' + new Date().toISOString())
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(50)
    if (error) {
      console.warn(`[enqueue-talent-extraction] rematch fetch failed: ${error.message}`)
      return
    }
    const ids = (roles ?? []).map((r) => (r as { id: string }).id)
    console.log(`[enqueue-talent-extraction] talent=${talentId} rematching ${ids.length} active roles`)

    let succeeded = 0
    let failed = 0
    for (const roleId of ids) {
      try {
        const result = await matchForRole({ roleId, isServiceRole: true })
        if (result.matches_added > 0) {
          console.log(`[enqueue-talent-extraction] role=${roleId} added ${result.matches_added} matches`)
        }
        succeeded++
      } catch (err) {
        const msg = err instanceof MatchError ? err.message : err instanceof Error ? err.message : String(err)
        console.warn(`[enqueue-talent-extraction] role=${roleId} match failed: ${msg}`)
        failed++
      }
    }
    console.log(`[enqueue-talent-extraction] rematch done talent=${talentId} ok=${succeeded} fail=${failed}`)
  } catch (err) {
    console.warn(`[enqueue-talent-extraction] rematch trigger error: ${err}`)
  }
}

function buildTalentPatch(extracted: ExtractedProfile): Record<string, unknown> {
  const allTags: Record<string, number> = {
    ...extracted.derived_tags,
    wants_wlb: extracted.wants_wlb ?? 0,
    wants_fair_pay: extracted.wants_fair_pay ?? 0,
    wants_growth: extracted.wants_growth ?? 0,
    wants_stability: extracted.wants_stability ?? 0,
    wants_flexibility: extracted.wants_flexibility ?? 0,
    wants_recognition: extracted.wants_recognition ?? 0,
    wants_mission: extracted.wants_mission ?? 0,
    wants_team_culture: extracted.wants_team_culture ?? 0,
  }

  return {
    parsed_resume: {
      key_skills: extracted.key_skills,
      job_areas: extracted.job_areas,
      years_experience: extracted.years_experience,
      career_goals: extracted.career_goals,
      ai_summary: extracted.summary,
    },
    derived_tags: allTags,
    expected_salary_min: extracted.salary_min,
    expected_salary_max: extracted.salary_max,
    employment_type_preferences: extracted.employment_type_preferences ?? [],
    current_employment_status: extracted.current_employment_status ?? null,
    current_salary: extracted.current_salary ?? null,
    notice_period_days: extracted.notice_period_days ?? null,
    reason_for_leaving_category: extracted.reason_for_leaving_category ?? null,
    reason_for_leaving_summary: extracted.reason_for_leaving_summary ?? null,
    education_level: extracted.education_level ?? null,
    has_management_experience: extracted.has_management_experience ?? null,
    management_team_size: extracted.management_team_size ?? null,
    work_authorization: extracted.work_authorization ?? null,
    preferred_management_style: extracted.preferred_management_style ?? null,
    deal_breaker_items: extracted.deal_breaker_items?.length ? extracted.deal_breaker_items : null,
    red_flags: extracted.red_flags?.length ? extracted.red_flags : null,
    has_noncompete: extracted.has_noncompete ?? null,
    noncompete_industry_scope: extracted.noncompete_industry_scope ?? null,
    salary_structure_preference: extracted.salary_structure_preference ?? null,
    role_scope_preference: extracted.role_scope_preference ?? null,
    career_goal_horizon: extracted.career_goal_horizon ?? null,
    job_intention: extracted.job_intention ?? null,
    shortest_tenure_months: extracted.shortest_tenure_months ?? null,
    avg_tenure_months: extracted.avg_tenure_months ?? null,
    work_arrangement_preference: extracted.work_arrangement_preference ?? null,
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Suppress unused-import lint when ExtractionError isn't directly referenced.
void ExtractionError
