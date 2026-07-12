/**
 * GET /api/stats
 * Returns anonymised aggregate counts for the public SocialProofStrip.
 * Uses the Supabase anon key — only exposes counts, never rows.
 * Cached at the CDN edge for 30 minutes (stale-while-revalidate) to avoid per-request DB hits.
 */
export const config = { runtime: 'edge' }

// Try VITE_ prefix (local dev via .env.local) then bare name (Vercel server env)
const SUPABASE_URL  = process.env.VITE_SUPABASE_URL  ?? process.env.SUPABASE_URL  ?? ''
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''

const CORS = {
  'Access-Control-Allow-Origin': 'https://diamondandjeweler.com',
  'Content-Type': 'application/json',
  'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
}

async function countTable(table: string, filter?: string): Promise<number> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return 0
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=id${filter ? `&${filter}` : ''}`
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      // Exact count kept for output-fidelity of the public counter (an estimate
      // for the leading-wildcard talent filter is just the planner's selectivity
      // guess). This is the FALLBACK path only — the fast path reads the
      // pre-aggregated platform_stats row (migration 0196).
      Prefer: 'count=exact',
      Range: '0-0',  // fetch only 1 row; count comes from Content-Range header
    },
  })
  const range = res.headers.get('content-range') // e.g. "0-0/842"
  if (!range) return 0
  const total = parseInt(range.split('/')[1] ?? '0', 10)
  return Number.isFinite(total) ? total : 0
}

/**
 * Fast path: read the single pre-aggregated counter row (migration 0196,
 * refreshed by cron). Returns null — signalling the caller to fall back to the
 * live count — when the table is absent (migration not yet applied → PostgREST
 * 404), the row is missing, or any field is non-numeric. This keeps /api/stats
 * correct whether or not 0196 has been applied.
 */
async function readCachedStats(): Promise<{ talents: number; companies: number } | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/platform_stats?select=talents_count,companies_count&limit=1`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } },
    )
    if (!res.ok) return null // e.g. 404 relation does not exist → migration not applied
    const rows = (await res.json()) as Array<{ talents_count?: number; companies_count?: number }>
    if (!Array.isArray(rows) || rows.length === 0) return null
    const { talents_count, companies_count } = rows[0]
    if (typeof talents_count !== 'number' || typeof companies_count !== 'number') return null
    return { talents: talents_count, companies: companies_count }
  } catch {
    return null
  }
}

export default async function handler(_req: Request): Promise<Response> {
  try {
    let talents: number
    let companies: number
    const cached = await readCachedStats()
    if (cached) {
      talents = cached.talents
      companies = cached.companies
    } else {
      // Fallback to the live count when the pre-agg row is unavailable.
      ;[talents, companies] = await Promise.all([
        countTable('profiles', 'role=ilike.*talent*'),
        countTable('companies'),
      ])
    }
    return new Response(
      JSON.stringify({ talents, companies, updatedAt: new Date().toISOString() }),
      { status: 200, headers: CORS },
    )
  } catch {
    // Never block the page load — return zeros on any error
    return new Response(
      JSON.stringify({ talents: 0, companies: 0, updatedAt: new Date().toISOString() }),
      { status: 200, headers: CORS },
    )
  }
}
