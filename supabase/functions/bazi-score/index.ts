/**
 * bazi-score (PRIVATE)
 *
 * Returns a numeric BaZi compatibility score [0..100] for two DOBs.
 *
 * SECRECY POSTURE
 * ----------------
 * The proprietary BaZi formula must NEVER be exposed to the client. This
 * function lives behind the service-role JWT and is only callable from
 * `match-generate` (server-to-server). To rotate to a fully-private external
 * compute, set BAZI_REMOTE_URL + BAZI_REMOTE_TOKEN — when both are present we
 * forward the request and use the returned score; otherwise we fall back to
 * the in-function stub so matching never breaks.
 *
 * Logging: only the *final score* is logged. The two DOBs and any
 * intermediate factors are never written to logs or the database.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'

interface Body { dob1?: string; dob2?: string }

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Service-role only. We compare against the SUPABASE_SERVICE_ROLE_KEY
  // (set as a function secret automatically by Supabase) so HM/talent JWTs
  // cannot reach this endpoint.
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`
  if (auth !== expected) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: Body = {}
  try { body = (await req.json()) as Body } catch { /* tolerate empty */ }
  if (!body.dob1 || !body.dob2) {
    return new Response(JSON.stringify({ error: 'Missing dob1/dob2' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Optional: forward to a fully-private external service for the real calc.
  const remoteUrl = Deno.env.get('BAZI_REMOTE_URL')
  const remoteTok = Deno.env.get('BAZI_REMOTE_TOKEN')
  if (remoteUrl && remoteTok) {
    try {
      const r = await fetch(remoteUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${remoteTok}` },
        body: JSON.stringify({ dob1: body.dob1, dob2: body.dob2 }),
      })
      if (r.ok) {
        const j = await r.json() as { score: number }
        return new Response(JSON.stringify({ score: j.score }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      // fallthrough to stub on remote failure
    } catch { /* fallthrough */ }
  }

  // STUB: deterministic in-function score. Real proprietary formula slots in
  // either by replacing this block OR by providing BAZI_REMOTE_URL above.
  const score = stubScore(body.dob1, body.dob2)
  return new Response(JSON.stringify({ score }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

function stubScore(d1: string, d2: string): number {
  const a = new Date(d1)
  const b = new Date(d2)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 50
  const z1 = a.getFullYear() % 12
  const z2 = b.getFullYear() % 12
  // Trine groups (best-friend zodiacs)
  const groups = [[0, 4, 8], [1, 5, 9], [2, 6, 10], [3, 7, 11]]
  const sameGroup = groups.some((g) => g.includes(z1) && g.includes(z2))
  let delta = 0
  if (sameGroup) delta += 25
  else if ((z1 + 6) % 12 === z2) delta -= 15
  const m1 = a.getMonth() + 1
  const m2 = b.getMonth() + 1
  const md = Math.abs(m1 - m2)
  if (md === 3 || md === 9) delta += 10
  if (md === 6) delta += 5
  return Math.max(0, Math.min(100, 50 + delta))
}
