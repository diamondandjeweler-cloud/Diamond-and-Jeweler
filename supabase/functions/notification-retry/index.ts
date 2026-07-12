/**
 * notification-retry
 *
 * Cron-driven drain of the durable notification outbox (migration 0085).
 *
 * Closes failure-mode F3: when `notify` fails to send a transactional email
 * (transient Resend / network error), it records a 'failed' outbox row with a
 * backoff schedule (0s → +1m → +5m, max 3 attempts). Nothing re-fired those
 * rows until this function existed.
 *
 * Each run:
 *   1. claim_notification_retry_batch(N) atomically CLAIMS a batch of due rows —
 *      failed rows past their backoff plus stranded in-flight rows — flipping
 *      each to 'sending' and SPENDING one attempt (FOR UPDATE SKIP LOCKED), then
 *      returns them. Spending the attempt at claim time (before the re-fire)
 *      hard-caps physical sends per row at max_attempts, so a lost bookkeeping
 *      write can never cause an unbounded re-send. Exhausted in-flight rows are
 *      retired to the terminal 'sent_unconfirmed' state (migration 0200).
 *   2. For each claimed row, re-invoke `notify` with the SAME user_id/type/data
 *      plus the outbox_id — notify re-attempts the EMAIL ONLY (skipping the send
 *      entirely if the row shows the mail already went out) and records the
 *      outcome via record_notification_attempt (sent, or failed + next backoff).
 *
 * Authorization: service-role only (cron / admin scripts). Scheduled every
 * minute by migration 0194 (bole-notification-retry-every-1m).
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireServiceRole } from '../_shared/auth.ts'
import { createLogger } from '../_shared/logger.ts'

const log = createLogger('notification-retry')

const BATCH_SIZE = 20

interface OutboxRow {
  id: string
  user_id: string
  notify_type: string
  payload: Record<string, unknown> | null
  channel: string
  attempt_count: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (req.method !== 'POST' && req.method !== 'GET') {
    return respond({ error: 'Method not allowed' }, 405)
  }

  // Only service-role callers (cron, admin scripts).
  const authErr = requireServiceRole(req)
  if (authErr) return authErr

  const db = adminClient()

  const { data: claimed, error: claimErr } = await db.rpc('claim_notification_retry_batch', {
    p_batch_size: BATCH_SIZE,
  })
  if (claimErr) {
    log.error('claim_notification_retry_batch failed', claimErr)
    return respond({ error: `Claim failed: ${claimErr.message}` }, 500)
  }

  const rows = (Array.isArray(claimed) ? claimed : []) as OutboxRow[]
  if (rows.length === 0) {
    await heartbeat(db)
    return respond({ processed: 0, message: 'No rows due for retry' })
  }

  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''

  let refired = 0
  for (const row of rows) {
    // Currently only the email channel is enqueued for retry by notify; guard
    // anyway so a future channel can't be mis-fired through the email path.
    if (row.channel !== 'email') continue
    try {
      await fetch(`${supabaseUrl}/functions/v1/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
        body: JSON.stringify({
          user_id: row.user_id,
          type: row.notify_type,
          data: row.payload ?? {},
          // Marks this as a retry: notify re-attempts the email only and calls
          // record_notification_attempt against this row (sent | failed+backoff).
          outbox_id: row.id,
        }),
      })
      refired++
    } catch (e) {
      // The claim already flipped the row to 'sending' (attempt spent). If the
      // re-fire itself throws (network) notify never recorded an attempt, so the
      // row would sit in 'sending'. Record a failed attempt so the backoff
      // advances (record does NOT double-count a 'sending' row) and it is
      // eventually retried or exhausted rather than stranded. A no-op if notify
      // already recorded before the throw (record is idempotent once terminal).
      log.error(`re-fire notify failed for outbox ${row.id}`, e)
      await recordFailure(db, row.id, e instanceof Error ? e.message : String(e))
    }
  }

  await heartbeat(db)
  return respond({ processed: rows.length, refired })
})

async function recordFailure(
  db: ReturnType<typeof adminClient>,
  outboxId: string,
  errorText: string,
): Promise<void> {
  try {
    await db.rpc('record_notification_attempt', {
      p_outbox_id: outboxId,
      p_success: false,
      p_error: `retry re-fire error: ${errorText}`.slice(0, 1000),
    })
  } catch { /* non-fatal */ }
}

// Best-effort cron heartbeat; never let it break the job.
async function heartbeat(db: ReturnType<typeof adminClient>): Promise<void> {
  try {
    await db.from('cron_heartbeat').upsert(
      { job_name: 'notification-retry', last_run_at: new Date().toISOString() },
      { onConflict: 'job_name' },
    )
  } catch { /* non-fatal */ }
}

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
