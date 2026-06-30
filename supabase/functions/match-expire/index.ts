/**
 * match-expire
 *
 * Called by pg_cron every 6 hours. Flips stale matches to 'expired',
 * logs them to match_history, and re-triggers match-generate for each affected
 * role (which enforces its own refresh_limit_per_role — so no infinite loop).
 *
 * Authorization: admin or service-role only (cron uses service-role key).
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'
import { reportError } from '../_shared/observe.ts'
import { createLogger } from '../_shared/logger.ts'

const log = createLogger('match-expire')

const EXPIRABLE = [
  'generated','viewed','accepted_by_talent','invited_by_manager','hr_scheduling',
]

// Wrapped so any uncaught throw in the cron handler is reported to the edge
// error sink before propagating. Re-throws unchanged — status/response/control
// flow are byte-for-byte identical to the bare handler (purely additive).
serve(async (req) => {
  try {
    return await handler(req)
  } catch (e) {
    await reportError(e, { fn: 'match-expire' })
    throw e
  }
})

async function handler(req: Request): Promise<Response> {
  const pre = handleOptions(req); if (pre) return pre

  const auth = await authenticate(req, { requiredRoles: ['admin'] })
  if (auth instanceof Response) return auth

  const db = adminClient()
  // Heartbeat as soon as the worker runs — not only on the success returns
  // below — so a transient throw in any pass can't skip it and trip a false
  // dead-man alert. The end-of-run heartbeats stay as the completion signal.
  await heartbeat(db)
  const nowIso = new Date().toISOString()
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const notifyUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/notify`

  // ---------- Pass A: 24 h expiry warnings ----------
  // Cron runs every 6 h, so we pick up any match expiring within the next
  // 23–29 h that hasn't been warned yet (overlap guards against timing drift).
  const warnFromIso = new Date(Date.now() + 23 * 3600 * 1000).toISOString()
  const warnToIso   = new Date(Date.now() + 29 * 3600 * 1000).toISOString()
  const { data: warnable } = await db.from('matches')
    .select('id, role_id, talent_id, status')
    .in('status', EXPIRABLE)
    .is('expiry_warning_sent_at', null)
    .gte('expires_at', warnFromIso)
    .lte('expires_at', warnToIso)

  let warned = 0
  for (const m of warnable ?? []) {
    const recipients: string[] = []
    const { data: t } = await db.from('talents')
      .select('profile_id').eq('id', m.talent_id).maybeSingle()
    if (t?.profile_id) recipients.push(t.profile_id)

    const { data: r } = await db.from('roles')
      .select('hiring_manager_id').eq('id', m.role_id).maybeSingle()
    if (r?.hiring_manager_id) {
      const { data: hm } = await db.from('hiring_managers')
        .select('profile_id').eq('id', r.hiring_manager_id).maybeSingle()
      if (hm?.profile_id) recipients.push(hm.profile_id)
    }

    for (const uid of recipients) {
      fetch(notifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
        body: JSON.stringify({
          user_id: uid,
          type: 'match_expiring',
          data: { match_id: m.id },
        }),
      }).catch(() => { /* best effort */ })
    }
    await db.from('matches').update({ expiry_warning_sent_at: new Date().toISOString() }).eq('id', m.id)
    warned++
  }

  // ---------- Pass A2: 48h no-action reminders (v4 §14) ----------
  // Scan every 6h for matches a user viewed/accepted 48–54h ago and never
  // acted on further. Window is [48h, 54h] so consecutive cron runs don't
  // double-fire; the reminder_48h_sent_at column also guards against
  // re-sending if the window is widened later.
  const reminderCutoffOldIso = new Date(Date.now() - 54 * 3600 * 1000).toISOString()
  const reminderCutoffNewIso = new Date(Date.now() - 48 * 3600 * 1000).toISOString()

  async function sendNoActionReminder(matchId: string, userId: string, audience: 'talent' | 'hiring_manager') {
    fetch(notifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
      body: JSON.stringify({
        user_id: userId,
        type: 'match_no_action_48h',
        data: { match_id: matchId, audience },
      }),
    }).catch(() => { /* best effort */ })
    await db.from('matches').update({ reminder_48h_sent_at: new Date().toISOString() }).eq('id', matchId)
  }

  // Talent side: status='viewed' and viewed_at 48–54h ago.
  const { data: talentNudge } = await db.from('matches')
    .select('id, talent_id')
    .eq('status', 'viewed')
    .is('reminder_48h_sent_at', null)
    .gte('viewed_at', reminderCutoffOldIso)
    .lt('viewed_at', reminderCutoffNewIso)
  let reminded = 0
  for (const m of talentNudge ?? []) {
    const { data: t } = await db.from('talents')
      .select('profile_id').eq('id', m.talent_id).maybeSingle()
    if (t?.profile_id) {
      await sendNoActionReminder(m.id, t.profile_id, 'talent')
      reminded++
    }
  }

  // HM side: status='accepted_by_talent' and accepted_at 48–54h ago.
  const { data: hmNudge } = await db.from('matches')
    .select('id, role_id')
    .eq('status', 'accepted_by_talent')
    .is('reminder_48h_sent_at', null)
    .gte('accepted_at', reminderCutoffOldIso)
    .lt('accepted_at', reminderCutoffNewIso)
  for (const m of hmNudge ?? []) {
    const { data: r } = await db.from('roles')
      .select('hiring_manager_id').eq('id', m.role_id).maybeSingle()
    if (!r?.hiring_manager_id) continue
    const { data: hm } = await db.from('hiring_managers')
      .select('profile_id').eq('id', r.hiring_manager_id).maybeSingle()
    if (hm?.profile_id) {
      await sendNoActionReminder(m.id, hm.profile_id, 'hiring_manager')
      reminded++
    }
  }

  // ---------- Pass B: expire anything past its deadline ----------
  const { data: expired, error: expErr } = await db.from('matches')
    .update({ status: 'expired', updated_at: nowIso })
    .in('status', EXPIRABLE)
    .lt('expires_at', nowIso)
    .select('id, role_id, talent_id')
  if (expErr) return json({ error: expErr.message }, 500)

  const expiredCount = expired?.length ?? 0
  if (expiredCount === 0) {
    await heartbeat(db)
    return json({ expired: 0, regenerated: 0, warned, reminded })
  }

  await db.from('match_history').insert(
    (expired ?? []).map((m) => ({
      role_id: m.role_id,
      talent_id: m.talent_id,
      action: 'expired_auto',
      previous_match_id: m.id,
    })),
  )

  // ---------- v4 §16: ghost-score auto-increment ----------
  // Bump profiles.ghost_score for the talents / HMs whose match just expired,
  // from their TOTAL ghosted matches (talent: expired + never accepted; HM:
  // expired + never invited, across all their roles): target = min(10,
  // floor(ghosted/3)), raised only — never lowered. Batched into ONE set-based
  // RPC (migration 0168); was ~4 queries per talent + ~5 per role, serially.
  const uniqueTalentIds = [...new Set((expired ?? []).map((m) => m.talent_id).filter(Boolean))]
  const uniqueRoleIds   = [...new Set((expired ?? []).map((m) => m.role_id).filter(Boolean))]

  if (uniqueTalentIds.length > 0 || uniqueRoleIds.length > 0) {
    const { error: ghostErr } = await db.rpc('bump_ghost_scores_for_expired', {
      p_talent_ids: uniqueTalentIds,
      p_role_ids: uniqueRoleIds,
    })
    if (ghostErr) log.error('bump_ghost_scores_for_expired failed', ghostErr.message)
  }

  // Re-queue the affected roles instead of a SERIAL fan-out of synchronous
  // match-generate HTTP calls (the old loop blocked this 6h cron for one full
  // generation × N roles — a Performance N+1). process-match-queue (every 1m)
  // drains the queue with bounded concurrency, calling the SAME matchForRole,
  // so refresh_limit_per_role is still enforced. enqueue_roles_for_rematch
  // (migration 0167) skips inactive / vacancy-expired roles and dedups against
  // the partial-unique index — one INSERT total instead of N round-trips.
  const roleIds = [...new Set((expired ?? []).map((m) => m.role_id).filter(Boolean))]

  let enqueued = 0
  if (roleIds.length > 0) {
    const { data: n, error: enqErr } = await db.rpc('enqueue_roles_for_rematch', {
      p_role_ids: roleIds,
      p_priority: 5,
    })
    if (enqErr) log.error('enqueue_roles_for_rematch failed', enqErr.message)
    else if (typeof n === 'number') enqueued = n
  }

  await heartbeat(db)
  return json({ expired: expiredCount, enqueued, warned, reminded })
}

// Best-effort cron heartbeat; never let it break the job.
async function heartbeat(db: ReturnType<typeof adminClient>) {
  try {
    await db.from('cron_heartbeat').upsert(
      { job_name: 'match-expire', last_run_at: new Date().toISOString() },
      { onConflict: 'job_name' },
    )
  } catch { /* non-fatal */ }
}
