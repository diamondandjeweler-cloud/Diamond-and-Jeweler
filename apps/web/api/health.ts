/**
 * GET /api/health — deep health check for an EXTERNAL uptime monitor.
 *
 * Returns 200 when the async backbone is alive, 503 when it is not, so a free
 * external monitor (UptimeRobot / cron-job.org / Better Uptime) can PAGE the
 * owner. This exists because the cron→edge match pipeline died silently for ~27
 * days with only an in-app alert nobody saw (see migration 0161 / docs).
 *
 * "Unhealthy" = the most recent pg_cron heartbeat is stale (>10 min), i.e. the
 * cron→edge path is broken — OR Supabase/PostgREST is unreachable. A missing env
 * config reports 200 (a deploy/config gap should not page).
 *
 * "Degraded" = the heartbeat is fresh (matcher IS running) but it is failing most
 * recent queue items — recent_failure_ratio over a minimum recent volume exceeds
 * the threshold (see migration 0163). This is a 503 so the monitor still pages on a
 * silently-broken matcher that a heartbeat-only check would report healthy.
 */
export const config = { runtime: 'edge' }

// Page on a matcher that runs but mostly fails: >50% of recent terminal items
// failed, with enough volume to be meaningful (avoid pinning on 1–2 blips).
const FAILURE_RATIO_THRESHOLD = 0.5
const FAILURE_MIN_VOLUME = 5

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL      ?? process.env.SUPABASE_URL      ?? ''
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

export default async function handler(): Promise<Response> {
  const ts = new Date().toISOString()

  // Can't assess without config — don't page on a config gap.
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    return new Response(JSON.stringify({ status: 'ok', note: 'health-unconfigured', ts }), { status: 200, headers: HEADERS })
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pipeline_health`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) {
      // PostgREST/DB unreachable or RPC error — a real outage worth alerting.
      return new Response(JSON.stringify({ status: 'error', stage: 'rpc', code: res.status, ts }), { status: 503, headers: HEADERS })
    }
    const data = (await res.json()) as {
      healthy?: boolean
      last_heartbeat_age_seconds?: number | null
      recent_done?: number | null
      recent_failed?: number | null
      recent_failure_ratio?: number | null
    }
    const healthy = data?.healthy === true

    // Matcher runs (fresh heartbeat) but is failing most recent items: page anyway.
    const ratio = typeof data?.recent_failure_ratio === 'number' ? data.recent_failure_ratio : null
    const volume = (data?.recent_done ?? 0) + (data?.recent_failed ?? 0)
    if (healthy && ratio !== null && volume >= FAILURE_MIN_VOLUME && ratio > FAILURE_RATIO_THRESHOLD) {
      return new Response(
        JSON.stringify({ status: 'degraded', pipeline: data, ts }),
        { status: 503, headers: HEADERS },
      )
    }

    return new Response(
      JSON.stringify({ status: healthy ? 'ok' : 'degraded', pipeline: data, ts }),
      { status: healthy ? 200 : 503, headers: HEADERS },
    )
  } catch {
    // Timeout / network failure — surface it so the monitor catches a real outage.
    return new Response(JSON.stringify({ status: 'error', stage: 'fetch', ts }), { status: 503, headers: HEADERS })
  }
}
