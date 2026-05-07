/**
 * proactive-job-push
 *
 * Module 4 — Proactive monthly growth-opportunity nudge.
 *
 * Triggered by pg_cron 'bole-proactive-growth-nudge-1st-09mt' at 01:05 UTC
 * on the 1st of each month (09:05 MYT, 5 min after the fortune refresher).
 * Service-role only.
 *
 * Pipeline:
 *   1. list_growth_nudge_candidates() returns opt-in talents in enabled
 *      regions whose pre-filter (cooldown, snooze, fortune_score) passes.
 *   2. For each candidate, decrypt DOB → compute age weight against the
 *      region's config → apply the final score threshold.
 *   3. For survivors, pick top-N active jobs and enqueue a 'growth_opportunity'
 *      notification with role IDs in the payload.
 *   4. Log to nudge_history (also bumps cooldown).
 *
 * Privacy posture:
 *   - Age + DOB never persisted; computed in-memory and discarded
 *   - The eligibility-score blend never appears in the payload sent to notify
 *   - Audit log records "nudge_sent" + role count only — no scores, no age
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireServiceRole } from '../_shared/auth.ts'

interface Candidate {
  talent_id: string
  profile_id: string
  region_code: string
  encrypted_dob: string
  fortune_score: number
  age_cutoff: number
  age_ramp_years: number
  age_weight_floor: number
  score_threshold: number
  max_jobs_per_nudge: number
}

interface RoleRow {
  role_id: string
  title: string
  location: string | null
  salary_min: number | null
  salary_max: number | null
  rank_score: number
}

function ageFromDob(dobIso: string): number {
  const d = new Date(dobIso)
  if (Number.isNaN(d.getTime())) return Number.NaN
  const now = new Date()
  let age = now.getUTCFullYear() - d.getUTCFullYear()
  const m = now.getUTCMonth() - d.getUTCMonth()
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--
  return age
}

function ageWeight(age: number, cutoff: number, ramp: number, floor: number): number {
  if (Number.isNaN(age)) return 1
  if (age <= cutoff) return 1
  const excess = age - cutoff
  if (excess >= ramp) return floor
  return 1 - ((1 - floor) * excess) / Math.max(ramp, 1)
}

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  const authErr = requireServiceRole(req)
  if (authErr) return authErr

  const db = adminClient()

  const { data: candidates, error: cErr } = await db.rpc('list_growth_nudge_candidates')
  if (cErr) {
    return new Response(JSON.stringify({ ok: false, stage: 'list', error: cErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const cands = (candidates ?? []) as Candidate[]

  let scanned = cands.length
  let qualified = 0
  let nudged = 0
  let skipped_no_jobs = 0
  let errors = 0

  for (const c of cands) {
    try {
      const { data: dob } = await db.rpc('decrypt_dob', { encrypted: c.encrypted_dob })
      if (typeof dob !== 'string') { errors++; continue }
      const age = ageFromDob(dob)
      const weight = ageWeight(age, c.age_cutoff, c.age_ramp_years, Number(c.age_weight_floor))
      const blended = Number(c.fortune_score) * weight
      if (blended < Number(c.score_threshold)) continue
      qualified++

      const { data: jobs } = await db.rpc('pick_top_jobs_for_talent', {
        p_talent_id: c.talent_id,
        p_limit: c.max_jobs_per_nudge ?? 3,
      })
      const jobList = (jobs ?? []) as RoleRow[]
      if (jobList.length === 0) { skipped_no_jobs++; continue }

      const roleIds = jobList.map((j) => j.role_id)
      const payload = {
        roles: jobList.map((j) => ({
          id: j.role_id,
          title: j.title,
          location: j.location,
          salary_min: j.salary_min,
          salary_max: j.salary_max,
        })),
      }

      const { data: outboxId, error: oErr } = await db.rpc('enqueue_notification', {
        p_user_id: c.profile_id,
        p_notify_type: 'growth_opportunity',
        p_payload: payload,
        p_channel: 'email',
      })
      if (oErr) { errors++; continue }

      const { error: rErr } = await db.rpc('record_growth_nudge', {
        p_talent_id: c.talent_id,
        p_outbox_id: outboxId,
        p_role_ids: roleIds,
      })
      if (rErr) { errors++; continue }

      // Best-effort dispatch via the existing notify edge fn. Failures land
      // in the outbox and the retry cron picks them up — no need to await.
      const baseUrl = Deno.env.get('SUPABASE_URL')!
      const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      void fetch(`${baseUrl}/functions/v1/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
        body: JSON.stringify({
          user_id: c.profile_id,
          type: 'growth_opportunity',
          data: payload,
        }),
      }).catch(() => { /* outbox catches the miss */ })

      nudged++
    } catch {
      errors++
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    scanned,
    qualified,
    nudged,
    skipped_no_jobs,
    errors,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
