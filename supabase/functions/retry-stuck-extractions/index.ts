/**
 * retry-stuck-extractions
 *
 * Cron-driven backstop for the async talent extraction pipeline.
 *
 * Picks up talents stuck in extraction_status = 'pending' or 'processing'
 * for more than 10 minutes — typically the result of a dropped fire-and-forget
 * fetch from the onboarding page, an Edge Function crash, or a network blip.
 *
 * For each stuck row it calls runExtraction() inline (waitUntil-style isn't
 * needed here since cron is already off the user's critical path) and writes
 * the result back to the talents row. Failures bump extraction_attempts and
 * leave the row in 'failed' if it has tried three times — admin can re-run
 * via extract-talent-profile manually.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { adminClient } from '../_shared/supabase.ts'
import {
  runExtraction,
  type ExtractionMessage,
  type ExtractedProfile,
} from '../_shared/talent-extraction.ts'
import { matchForRole, MatchError } from '../_shared/match-core.ts'

const STUCK_AGE_MINUTES = 10
const MAX_ATTEMPTS = 3
const BATCH_SIZE = 5

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (req.method !== 'POST' && req.method !== 'GET') {
    return respond({ error: 'Method not allowed' }, 405)
  }

  // Only service-role callers (cron, admin scripts).
  const authHeader = req.headers.get('Authorization') ?? ''
  const svcKey     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!svcKey || !authHeader.endsWith(svcKey)) {
    return respond({ error: 'Unauthorized' }, 401)
  }

  const db = adminClient()
  const cutoff = new Date(Date.now() - STUCK_AGE_MINUTES * 60_000).toISOString()

  // Claim stuck rows. Filter by `updated_at < cutoff` rather than created_at
  // so a row that's actively being processed (status flipped to 'processing'
  // very recently) is left alone.
  const { data: stuck, error: claimErr } = await db
    .from('talents')
    .select('id, profile_id, extraction_attempts, interview_answers')
    .in('extraction_status', ['pending', 'processing'])
    .lte('updated_at', cutoff)
    .lt('extraction_attempts', MAX_ATTEMPTS)
    .order('updated_at', { ascending: true })
    .limit(BATCH_SIZE)
  if (claimErr) return respond({ error: `Claim failed: ${claimErr.message}` }, 500)

  const rows = stuck ?? []
  if (rows.length === 0) return respond({ processed: 0, message: 'No stuck rows' })

  console.log(`[retry-stuck-extractions] picked up ${rows.length} stuck rows`)

  let succeeded = 0, failed = 0
  for (const row of rows as { id: string; extraction_attempts: number; interview_answers: { transcript?: ExtractionMessage[] } | null }[]) {
    const attempt = (row.extraction_attempts ?? 0) + 1
    await db.from('talents').update({
      extraction_status: 'processing',
      extraction_started_at: new Date().toISOString(),
      extraction_attempts: attempt,
    }).eq('id', row.id)

    const messages = Array.isArray(row.interview_answers?.transcript)
      ? (row.interview_answers!.transcript as ExtractionMessage[])
      : []

    if (messages.length === 0) {
      await db.from('talents').update({
        extraction_status: 'failed',
        extraction_error: 'No transcript on talents.interview_answers',
      }).eq('id', row.id)
      failed++
      continue
    }

    try {
      const extracted = await runExtraction(messages)
      const patch = buildTalentPatch(extracted)
      await db.from('talents').update({
        ...patch,
        extraction_status: 'complete',
        extraction_completed_at: new Date().toISOString(),
        extraction_error: null,
        is_open_to_offers: true,
      }).eq('id', row.id)
      console.log(`[retry-stuck-extractions] talent=${row.id} attempt=${attempt} ok`)
      // Inline rematch — bounded fanout against most-recent active roles.
      await rematchActiveRoles(row.id).catch((err) => {
        console.warn(`[retry-stuck-extractions] rematch error: ${err}`)
      })
      succeeded++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[retry-stuck-extractions] talent=${row.id} attempt=${attempt} FAILED: ${msg}`)
      await db.from('talents').update({
        extraction_status: attempt >= MAX_ATTEMPTS ? 'failed' : 'pending',
        extraction_error: msg.slice(0, 1000),
      }).eq('id', row.id)
      failed++
    }
  }

  return respond({ processed: rows.length, succeeded, failed })
})

async function rematchActiveRoles(talentId: string): Promise<void> {
  const db = adminClient()
  const { data: roles, error } = await db
    .from('roles')
    .select('id')
    .eq('status', 'active')
    .or('vacancy_expires_at.is.null,vacancy_expires_at.gt.' + new Date().toISOString())
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(50)
  if (error) {
    console.warn(`[retry-stuck-extractions] rematch fetch failed: ${error.message}`)
    return
  }
  const ids = (roles ?? []).map((r) => (r as { id: string }).id)
  let ok = 0, fail = 0
  for (const roleId of ids) {
    try {
      const result = await matchForRole({ roleId, isServiceRole: true })
      if (result.matches_added > 0) {
        console.log(`[retry-stuck-extractions] talent=${talentId} role=${roleId} +${result.matches_added}`)
      }
      ok++
    } catch (err) {
      const msg = err instanceof MatchError ? err.message : err instanceof Error ? err.message : String(err)
      console.warn(`[retry-stuck-extractions] role=${roleId} match failed: ${msg}`)
      fail++
    }
  }
  console.log(`[retry-stuck-extractions] rematch done talent=${talentId} ok=${ok} fail=${fail}`)
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

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
