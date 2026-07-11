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

  // Bound per-invocation work: at most this many rows per warn/remind pass so a
  // single cron run can never do unbounded work. Overflow rolls to the next run
  // — the warn/remind windows are widened by one cron interval (6h) below so a
  // deferred row is still inside the window on the next pass and isn't missed.
  const PASS_LIMIT = 500

  // ---------- Pass A: 24 h expiry warnings ----------
  // Cron runs every 6 h; pick up any match expiring within the next 17–29 h
  // that hasn't been warned yet. Lower bound widened 23h→17h so a row deferred
  // by PASS_LIMIT this run is still inside the window 6h later (overlap also
  // guards against timing drift; expiry_warning_sent_at prevents re-warning).
  const warnFromIso = new Date(Date.now() + 17 * 3600 * 1000).toISOString()
  const warnToIso   = new Date(Date.now() + 29 * 3600 * 1000).toISOString()

  // Pass A/A2 must NEVER skip Pass B (core expiry). Wrap each in try/catch so a
  // throw here is logged and the run continues to expiry rather than aborting.
  let warned = 0
  try {
    // ONE round-trip: join matches → talents and matches → roles →
    // hiring_managers (left joins, matching the per-match maybeSingle lookups
    // this replaces — a match with no talent/HM profile is still stamped but
    // simply yields no recipient, exactly as before).
    const { data: warnable } = await db.from('matches')
      .select('id, talents(profile_id), roles(hiring_managers(profile_id))')
      .in('status', EXPIRABLE)
      .is('expiry_warning_sent_at', null)
      .gte('expires_at', warnFromIso)
      .lte('expires_at', warnToIso)
      .order('expires_at', { ascending: true })
      .limit(PASS_LIMIT)

    const warnRows = warnable ?? []
    const warnStampIds: string[] = []
    const warnTasks: Promise<Response>[] = []
    for (const m of warnRows) {
      const recipients: string[] = []
      const talentPid = (m as any).talents?.profile_id
      if (talentPid) recipients.push(talentPid)
      const hmPid = (m as any).roles?.hiring_managers?.profile_id
      if (hmPid) recipients.push(hmPid)

      for (const uid of recipients) {
        warnTasks.push(fetch(notifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
          body: JSON.stringify({
            user_id: uid,
            type: 'match_expiring',
            data: { match_id: (m as any).id },
          }),
        }))
      }
      // Stamp every warnable row (matches the original's unconditional stamp).
      warnStampIds.push((m as any).id)
    }

    // Fan out notifications; one failure must not abort the batch.
    await Promise.allSettled(warnTasks)

    // ONE bulk stamp instead of N per-row UPDATEs.
    if (warnStampIds.length > 0) {
      await db.from('matches')
        .update({ expiry_warning_sent_at: new Date().toISOString() })
        .in('id', warnStampIds)
      warned = warnStampIds.length
    }
  } catch (e) {
    console.error('match-expire Pass A (expiry warnings) failed', (e as Error)?.message)
  }

  // ---------- Pass A2: 48h no-action reminders (v4 §14) ----------
  // Scan every 6h for matches a user viewed/accepted 48–60h ago and never
  // acted on further. Upper age bound widened 54h→60h so a row deferred by
  // PASS_LIMIT this run is still inside the window 6h later; the
  // reminder_48h_sent_at column guards against double-firing.
  const reminderCutoffOldIso = new Date(Date.now() - 60 * 3600 * 1000).toISOString()
  const reminderCutoffNewIso = new Date(Date.now() - 48 * 3600 * 1000).toISOString()

  let reminded = 0
  try {
    const remindStampIds: string[] = []
    const remindTasks: Promise<Response>[] = []

    const pushReminder = (matchId: string, userId: string, audience: 'talent' | 'hiring_manager') => {
      remindTasks.push(fetch(notifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
        body: JSON.stringify({
          user_id: userId,
          type: 'match_no_action_48h',
          data: { match_id: matchId, audience },
        }),
      }))
      remindStampIds.push(matchId)
      reminded++
    }

    // Talent side: status='viewed' and viewed_at 48–60h ago. ONE join query.
    const { data: talentNudge } = await db.from('matches')
      .select('id, talents(profile_id)')
      .eq('status', 'viewed')
      .is('reminder_48h_sent_at', null)
      .gte('viewed_at', reminderCutoffOldIso)
      .lt('viewed_at', reminderCutoffNewIso)
      .order('viewed_at', { ascending: true })
      .limit(PASS_LIMIT)
    for (const m of talentNudge ?? []) {
      const pid = (m as any).talents?.profile_id
      // Only stamp rows that actually get a reminder (matches original: a row
      // with no talent profile is left unstamped for a later retry).
      if (pid) pushReminder((m as any).id, pid, 'talent')
    }

    // HM side: status='accepted_by_talent' and accepted_at 48–60h ago. ONE join.
    const { data: hmNudge } = await db.from('matches')
      .select('id, roles(hiring_managers(profile_id))')
      .eq('status', 'accepted_by_talent')
      .is('reminder_48h_sent_at', null)
      .gte('accepted_at', reminderCutoffOldIso)
      .lt('accepted_at', reminderCutoffNewIso)
      .order('accepted_at', { ascending: true })
      .limit(PASS_LIMIT)
    for (const m of hmNudge ?? []) {
      const pid = (m as any).roles?.hiring_managers?.profile_id
      if (pid) pushReminder((m as any).id, pid, 'hiring_manager')
    }

    await Promise.allSettled(remindTasks)

    // ONE bulk stamp for all reminders sent this run.
    if (remindStampIds.length > 0) {
      await db.from('matches')
        .update({ reminder_48h_sent_at: new Date().toISOString() })
        .in('id', remindStampIds)
    }
  } catch (e) {
    console.error('match-expire Pass A2 (48h reminders) failed', (e as Error)?.message)
  }

  // ---------- Pass B: expire anything past its deadline ----------
  // BOUNDED core expiry. The old single unbounded UPDATE ... RETURNING is
  // replaced by a claim-then-update loop: SELECT a capped batch of ids matching
  // the predicate, then UPDATE those ids (re-asserting the predicate so a row
  // that raced out of EXPIRABLE between SELECT and UPDATE is never wrongly
  // expired or double-logged). A few batches per invocation cap the work;
  // overflow rolls to the next 6h run — same rows, fewer per run. Runs
  // unconditionally after Passes A/A2 (which are try/guarded) so core expiry is
  // never skipped by a warn/remind failure.
  const EXPIRE_BATCH = 500
  const EXPIRE_MAX_BATCHES = 5
  const expired: Array<{ id: string; role_id: string; talent_id: string }> = []
  for (let i = 0; i < EXPIRE_MAX_BATCHES; i++) {
    const { data: claim, error: claimErr } = await db.from('matches')
      .select('id')
      .in('status', EXPIRABLE)
      .lt('expires_at', nowIso)
      .order('expires_at', { ascending: true })
      .limit(EXPIRE_BATCH)
    if (claimErr) return json({ error: claimErr.message }, 500)
    const ids = (claim ?? []).map((r) => r.id)
    if (ids.length === 0) break

    const { data: batch, error: expErr } = await db.from('matches')
      .update({ status: 'expired', updated_at: nowIso })
      .in('id', ids)
      .in('status', EXPIRABLE)
      .lt('expires_at', nowIso)
      .select('id, role_id, talent_id')
    if (expErr) return json({ error: expErr.message }, 500)
    if (batch && batch.length) expired.push(...batch)
    if (ids.length < EXPIRE_BATCH) break
  }

  const expiredCount = expired.length
  if (expiredCount === 0) {
    await heartbeat(db)
    return json({ expired: 0, regenerated: 0, warned, reminded })
  }

  await db.from('match_history').insert(
    expired.map((m) => ({
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
  const uniqueTalentIds = [...new Set(expired.map((m) => m.talent_id).filter(Boolean))]
  const uniqueRoleIds   = [...new Set(expired.map((m) => m.role_id).filter(Boolean))]

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
  const roleIds = [...new Set(expired.map((m) => m.role_id).filter(Boolean))]

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
