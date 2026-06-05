/**
 * GET /api/stats
 * Returns anonymised aggregate counts for the public SocialProofStrip.
 * Uses the Supabase anon key — only exposes counts, never rows.
 * Cached at the CDN edge for 5 minutes to avoid per-request DB hits.
 */
export const config = { runtime: 'edge' }

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL  ?? ''
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? ''

const CORS = {
  'Access-Control-Allow-Origin': 'https://diamondandjeweler.com',
  'Content-Type': 'application/json',
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
}

async function countTable(table: string, filter?: string): Promise<number> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return 0
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=id${filter ? `&${filter}` : ''}`
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      Prefer: 'count=exact',
      Range: '0-0',  // fetch only 1 row; count comes from Content-Range header
    },
  })
  const range = res.headers.get('content-range') // e.g. "0-0/842"
  if (!range) return 0
  const total = parseInt(range.split('/')[1] ?? '0', 10)
  return Number.isFinite(total) ? total : 0
}

export default async function handler(_req: Request): Promise<Response> {
  try {
    const [talents, companies] = await Promise.all([
      countTable('profiles', 'role=ilike.*talent*'),
      countTable('companies'),
    ])
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
