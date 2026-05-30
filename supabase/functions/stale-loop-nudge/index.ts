/**
 * stale-loop-nudge
 *
 * Called by pg_cron daily at 09:30 MYT. Walks v_stale_roles and v_stale_talents
 * and sends the corresponding party a market-gap nudge so they can revise their
 * role or preferences. All notifications go through the standard `notify`
 * Edge Function so email + WhatsApp + in-app stay consistent.
 *
 * Authorization: service-role only (cron uses service-role key).
 *
 * BaZi secrecy: this function MUST NOT surface life_chart / bazi / character.
 * Only commercial signals (salary, work_arrangement, hard filters).
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

const MAX_PER_RUN = 50  // safety: never email more than 50 HMs or 50 talents in a single cron tick

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre

  const auth = await authenticate(req, { requiredRoles: ['admin'] })
  if (auth instanceof Response) return auth

  const db = adminClient()
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const notifyUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/notify`

  let hmNudges = 0
  let talentNudges = 0
  const errors: string[] = []

  // ────────────────────────────────────────────────────────────────────────
  // HM side: stale roles
  // ────────────────────────────────────────────────────────────────────────
  const { data: staleRoles, error: rolesErr } = await db
    .from('v_stale_roles')
    .select('role_id, hiring_manager_id, title, location, experience_level, salary_max')
    .limit(MAX_PER_RUN)
  if (rolesErr) {
    errors.push(`v_stale_roles: ${rolesErr.message}`)
  } else {
    for (const r of staleRoles ?? []) {
      try {
        // Compute market gap via SECURITY DEFINER function.
        const { data: gap, error: gapErr } = await db.rpc('fn_compute_role_market_gap', { p_role_id: r.role_id })
        if (gapErr || !gap) {
          errors.push(`gap ${r.role_id}: ${gapErr?.message ?? 'no payload'}`)
          continue
        }

        const gaps = Array.isArray((gap as { gaps?: unknown[] }).gaps) ? (gap as { gaps: unknown[] }).gaps : []
        const peerCount = typeof (gap as { peer_count?: number }).peer_count === 'number'
          ? (gap as { peer_count: number }).peer_count
          : 0

        // Skip silent: if no gap was found AND peer market is empty, there's nothing
        // useful to say — let the HM continue uninterrupted.
        if (gaps.length === 0 && peerCount === 0) continue

        // Resolve HM's profile_id to deliver the notification.
        const { data: hm } = await db.from('hiring_managers')
          .select('profile_id').eq('id', r.hiring_manager_id).maybeSingle()
        if (!hm?.profile_id) continue

        // Persist the nudge first so the link the HM clicks can resolve back to gap_payload.
        const { data: row, error: insErr } = await db.from('stale_loop_nudges').insert({
          party: 'hm',
          subject_id: r.role_id,
          role_id: r.role_id,
          nudge_kind: 'stale_3d',
          gap_payload: gap,
          channel: ['in_app','email','whatsapp'],
        }).select('id').single()
        if (insErr || !row) {
          errors.push(`insert nudge ${r.role_id}: ${insErr?.message ?? 'no row'}`)
          continue
        }

        // Fire notify (best-effort, don't block the loop on slow Resend).
        const marketMedian = (gap as { market_median?: number | null }).market_median ?? null
        fetch(notifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
          body: JSON.stringify({
            user_id: hm.profile_id,
            type: 'stale_loop_role_nudge',
            data: {
              nudge_id: row.id,
              role_id: r.role_id,
              role_title: r.title,
              peer_count: peerCount,
              market_median: marketMedian,
              role_max: r.salary_max,
            },
          }),
        }).catch(() => { /* best effort */ })

        hmNudges++
      } catch (e) {
        errors.push(`role ${r.role_id}: ${(e as Error).message}`)
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Talent side: stale profiles
  // ────────────────────────────────────────────────────────────────────────
  const { data: staleTalents, error: talentsErr } = await db
    .from('v_stale_talents')
    .select('talent_id, profile_id, expected_salary_min, expected_salary_max')
    .limit(MAX_PER_RUN)
  if (talentsErr) {
    errors.push(`v_stale_talents: ${talentsErr.message}`)
  } else {
    for (const t of staleTalents ?? []) {
      try {
        const { data: gap, error: gapErr } = await db.rpc('fn_compute_talent_market_gap', { p_talent_id: t.talent_id })
        if (gapErr || !gap) {
          errors.push(`gap ${t.talent_id}: ${gapErr?.message ?? 'no payload'}`)
          continue
        }

        const gaps = Array.isArray((gap as { gaps?: unknown[] }).gaps) ? (gap as { gaps: unknown[] }).gaps : []
        const activeRoleCount = typeof (gap as { active_role_count?: number }).active_role_count === 'number'
          ? (gap as { active_role_count: number }).active_role_count
          : 0

        if (gaps.length === 0 && activeRoleCount === 0) continue

        const { data: row, error: insErr } = await db.from('stale_loop_nudges').insert({
          party: 'talent',
          subject_id: t.talent_id,
          talent_id: t.talent_id,
          nudge_kind: 'stale_3d',
          gap_payload: gap,
          channel: ['in_app','email','whatsapp'],
        }).select('id').single()
        if (insErr || !row) {
          errors.push(`insert nudge ${t.talent_id}: ${insErr?.message ?? 'no row'}`)
          continue
        }

        const roleMedianMax = (gap as { role_median_max?: number | null }).role_median_max ?? null
        fetch(notifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
          body: JSON.stringify({
            user_id: t.profile_id,
            type: 'stale_loop_talent_nudge',
            data: {
              nudge_id: row.id,
              talent_id: t.talent_id,
              active_role_count: activeRoleCount,
              role_median_max: roleMedianMax,
              expected_min: t.expected_salary_min,
            },
          }),
        }).catch(() => { /* best effort */ })

        talentNudges++
      } catch (e) {
        errors.push(`talent ${t.talent_id}: ${(e as Error).message}`)
      }
    }
  }

  return json({
    ok: true,
    hm_nudges: hmNudges,
    talent_nudges: talentNudges,
    errors: errors.slice(0, 20),
  })
})
