/**
 * process-match-queue — batch queue worker
 *
 * Invoked by a cron trigger (every minute or on demand via service-role POST).
 * Imports matchForRole directly from _shared/match-core — no HTTP hop, no
 * network round-trip to match-generate, no code duplication.
 *
 * Throughput (defaults: BATCH_SIZE=20, CONCURRENCY=5):
 *   ~20 roles/min → 10k roles in ~8 hours at steady, low DB load.
 *   Increase BATCH_SIZE to drain faster (e.g. 200 → ~50 min for 10k).
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { adminClient } from '../_shared/supabase.ts'
import { matchForRole, MatchError } from '../_shared/match-core.ts'
import { requireServiceRole } from '../_shared/auth.ts'

const BATCH_SIZE  = 20  // items claimed per invocation
const CONCURRENCY = 5   // max parallel matchForRole calls

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (req.method !== 'POST' && req.method !== 'GET') {
    return respond({ error: 'Method not allowed' }, 405)
  }

  // Only service-role callers (cron, admin scripts).
  // requireServiceRole inspects the gateway-verified JWT's role claim.
  const authErr = requireServiceRole(req)
  if (authErr) return authErr

  const db = adminClient()

  // Reset any items stalled in 'processing' for > 30 min (crash recovery)
  try { await db.rpc('reset_stalled_match_queue') } catch { /* non-fatal */ }

  // Atomically claim a batch (FOR UPDATE SKIP LOCKED — safe for concurrent invocations)
  const { data: claimed, error: claimErr } = await db.rpc('claim_match_queue_batch', {
    p_batch_size: BATCH_SIZE,
  })
  if (claimErr) return respond({ error: `Claim failed: ${claimErr.message}` }, 500)

  const items = (claimed ?? []) as { id: number; role_id: string; retry_count: number }[]
  if (items.length === 0) return respond({ processed: 0, succeeded: 0, failed: 0, message: 'Queue empty' })

  console.log(`[process-match-queue] claimed ${items.length} items`)

  // Process in parallel chunks of CONCURRENCY
  let succeeded = 0, failed = 0

  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const chunk = items.slice(i, i + CONCURRENCY)
    await Promise.allSettled(chunk.map(async (item) => {
      const t0 = Date.now()
      try {
        const result = await matchForRole({ roleId: item.role_id, isServiceRole: true })
        const elapsed = Date.now() - t0
        console.log(`[process-match-queue] role=${item.role_id} ok added=${result.matches_added} ${elapsed}ms`)
        await db.rpc('complete_match_queue_item', { p_id: item.id })
        succeeded++
      } catch (err) {
        const msg = err instanceof MatchError ? err.message
          : err instanceof Error ? err.message : String(err)
        console.error(`[process-match-queue] role=${item.role_id} FAILED: ${msg}`)
        await db.rpc('fail_match_queue_item', {
          p_id: item.id, p_error: msg.slice(0, 1000), p_retry_count: item.retry_count,
        })
        failed++
      }
    }))
  }

  console.log(`[process-match-queue] done succeeded=${succeeded} failed=${failed}`)
  return respond({ processed: items.length, succeeded, failed })
})

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
