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
 *   1. get_growth_nudge_qualified() (0182) runs the WHOLE qualification loop
 *      server-side in one round-trip: candidate pre-filter → decrypt DOB →
 *      age weight → final score threshold. Replaces the per-candidate
 *      decrypt_dob N+1 (one edge→Postgres RPC per opt-in talent).
 *   2. For qualified survivors — bounded fan-out (NUDGE_CONCURRENCY) —
 *      pick top-N active jobs and dispatch a 'growth_opportunity'
 *      notification with role IDs in the payload.
 *   3. Log to nudge_history (also bumps cooldown).
 *
 * Privacy posture (strengthened by 0182):
 *   - Age + DOB never persisted — and now never leave Postgres at all
 *     (this function no longer sees the decrypted DOB, only booleans)
 *   - The eligibility-score blend never appears in the payload sent to notify
 *   - Audit log records "nudge_sent" + role count only — no scores, no age
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireServiceRole } from '../_shared/auth.ts'
import { allSettledBounded } from '../_shared/pool.ts'

interface QualifiedRow {
  talent_id: string
  profile_id: string
  max_jobs_per_nudge: number
  qualified: boolean
  decrypt_failed: boolean
}

interface RoleRow {
  role_id: string
  title: string
  location: string | null
  salary_min: number | null
  salary_max: number | null
  rank_score: number
}

// Gentle on the shared PostgREST pool + the notify fan-out (Resend/WATI):
// bounded parallelism, not a thundering herd — the previous loop was serial.
const NUDGE_CONCURRENCY = 6

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  const authErr = requireServiceRole(req)
  if (authErr) return authErr

  const db = adminClient()

  const { data: rows, error: qErr } = await db.rpc('get_growth_nudge_qualified')
  if (qErr) {
    return new Response(JSON.stringify({ ok: false, stage: 'list', error: qErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const all = (rows ?? []) as QualifiedRow[]

  // Counter semantics preserved from the per-candidate loop:
  //   scanned  = every candidate the pre-filter returned
  //   errors   = decrypt failures + notify/record failures
  //   qualified= passed the age-weighted threshold
  const scanned = all.length
  let errors = all.filter((r) => r.decrypt_failed).length
  const survivors = all.filter((r) => r.qualified && !r.decrypt_failed)
  const qualified = survivors.length
  let nudged = 0
  let skipped_no_jobs = 0

  const baseUrl = Deno.env.get('SUPABASE_URL')!
  const svcKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  await allSettledBounded(survivors, NUDGE_CONCURRENCY, async (c) => {
    try {
      const { data: jobs } = await db.rpc('pick_top_jobs_for_talent', {
        p_talent_id: c.talent_id,
        p_limit: c.max_jobs_per_nudge ?? 3,
      })
      const jobList = (jobs ?? []) as RoleRow[]
      if (jobList.length === 0) { skipped_no_jobs++; return }

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

      // Dispatch via the notify edge fn. notify owns consent gating, locale
      // rendering, and Resend/WATI fan-out. We only bump the cooldown if the
      // dispatch returned 2xx — failures fall through and the user becomes
      // eligible again next month.
      let dispatched = false
      try {
        const r = await fetch(`${baseUrl}/functions/v1/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
          body: JSON.stringify({
            user_id: c.profile_id,
            type: 'growth_opportunity',
            data: payload,
          }),
        })
        dispatched = r.ok
      } catch {
        dispatched = false
      }
      if (!dispatched) { errors++; return }

      const { error: rErr } = await db.rpc('record_growth_nudge', {
        p_talent_id: c.talent_id,
        p_outbox_id: null,
        p_role_ids: roleIds,
      })
      if (rErr) { errors++; return }

      nudged++
    } catch {
      errors++
    }
  })

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
