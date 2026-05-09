// 11 — Tester accounts hidden.
// `@dnj-test.my` accounts must not appear in any anon-readable surface
// (public talent search, KPIs that show counts to non-admins, etc.).

import { mgmtSql } from '../lib/http.mjs'
import { config } from '../config.mjs'

export default async function check() {
  if (!config.SUPABASE_PAT) {
    return { name: 'Tester accounts hidden', status: 'SKIP', detail: 'PAT required', evidence: [] }
  }

  // Sanity: the seed should have produced 30 testers.
  const total = await mgmtSql(`
    select count(*)::int as n
    from public.profiles
    where email like '%@dnj-test.my'
  `)
  const expected = total[0]?.n ?? 0
  if (expected === 0) {
    return { name: 'Tester accounts hidden', status: 'WARN', detail: 'No testers seeded', evidence: [] }
  }

  // Probe 1: anon list of profiles must not include any tester.
  const r = await fetch(
    `${config.SUPABASE_URL}/rest/v1/profiles?email=like.*${encodeURIComponent('@dnj-test.my')}&select=email`,
    {
      headers: {
        apikey: config.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${config.SUPABASE_ANON_KEY}`,
      },
    }
  )
  const body = await r.json()

  if (Array.isArray(body) && body.length > 0) {
    return {
      name: 'Tester accounts hidden',
      status: 'FAIL',
      detail: `anon can see ${body.length} tester profile(s)`,
      evidence: body.slice(0, 5).map((p) => p.email),
    }
  }

  // Probe 2: anon match feed must not include tester talents.
  // (Best-effort — depends on whether matches are publicly readable at all.)
  const r2 = await fetch(`${config.SUPABASE_URL}/rest/v1/matches?select=id&limit=5`, {
    headers: {
      apikey: config.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${config.SUPABASE_ANON_KEY}`,
    },
  })
  const body2 = await r2.json()
  if (Array.isArray(body2) && body2.length > 0) {
    return {
      name: 'Tester accounts hidden',
      status: 'WARN',
      detail: 'anon can list matches table (RLS may be missing)',
      evidence: [],
    }
  }

  return {
    name: 'Tester accounts hidden',
    status: 'PASS',
    detail: `${expected} testers seeded; 0 visible to anon`,
    evidence: [],
  }
}
